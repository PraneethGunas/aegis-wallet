const SATS_TO_USD = 96000 / 100000000;
const dashboardUrl = "/api/demo/dashboard";

// ── DOM refs ───────────────────────────────────────────────────────────────────
const paymentsList = document.querySelector("#paymentsList");
const auditList = document.querySelector("#auditList");
const eventsList = document.querySelector("#eventsList");
const wsBadge = document.querySelector("#wsBadge");
const refreshButton = document.querySelector("#refreshButton");
const approvalModal = document.querySelector("#approvalModal");
const modalApprove = document.querySelector("#modalApprove");
const modalDeny = document.querySelector("#modalDeny");
const modalReason = document.querySelector("#modalReason");
const modalAmountSats = document.querySelector("#modalAmountSats");
const modalAmountUsd = document.querySelector("#modalAmountUsd");

let pendingApproval = null;

// ── Formatting ─────────────────────────────────────────────────────────────────

function satsToUsd(sats) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(sats * SATS_TO_USD);
}

function formatSats(sats) {
  return `${Number(sats).toLocaleString("en-US")} sats`;
}

function timeLabel(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

const originalRefreshText = refreshButton.textContent;

async function loadDashboard() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";

  try {
    const response = await fetch(dashboardUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderDashboard(data);
  } catch (err) {
    document.querySelector("#lastUpdated").textContent = "Failed to load — check backend";
    console.error("Dashboard fetch failed:", err);
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = originalRefreshText;
  }
}

function renderDashboard(data) {
  document.querySelector("#lastUpdated").textContent = `Updated ${timeLabel(new Date())}`;

  // Brief flash so the user can see data was actually refreshed
  const balanceCard = document.querySelector(".card-balance");
  balanceCard.classList.remove("refreshed");
  void balanceCard.offsetWidth; // force reflow to restart animation
  balanceCard.classList.add("refreshed");
  document.querySelector("#totalUsd").textContent = satsToUsd(data.wallet.total_balance_sats);
  document.querySelector("#totalSats").textContent = `${formatSats(data.wallet.total_balance_sats)} total`;
  document.querySelector("#fundingSats").textContent = formatSats(data.wallet.funding_balance_sats);
  document.querySelector("#spendingSats").textContent = formatSats(data.wallet.spending_balance_sats);
  document.querySelector("#spentToday").textContent = formatSats(data.wallet.spent_today_sats);
  document.querySelector("#agentLabel").textContent = data.agent.label;
  document.querySelector("#agentBudget").textContent = formatSats(data.agent.budget_sats);
  document.querySelector("#thresholdSats").textContent = formatSats(data.wallet.auto_pay_threshold_sats);
  document.querySelector("#credentialId").textContent = data.agent.credential_id;

  const statusEl = document.querySelector("#agentStatus");
  statusEl.textContent = data.agent.status;
  statusEl.className = `status-pill ${data.agent.status}`;

  const budgetUsed = Math.min(
    100,
    Math.round((data.wallet.spent_today_sats / Math.max(data.agent.budget_sats, 1)) * 100)
  );
  const budgetRemaining = Math.max(0, data.agent.budget_sats - data.wallet.spent_today_sats);
  document.querySelector("#budgetBar").style.width = `${budgetUsed}%`;
  document.querySelector("#budgetPercent").textContent = `${budgetUsed}% used today`;
  document.querySelector("#budgetRemaining").textContent = `${formatSats(budgetRemaining)} remaining`;

  renderPayments(data.payments);
  renderAudit(data.audit);
}

// ── Payment list ───────────────────────────────────────────────────────────────

function renderPayments(payments) {
  renderList(
    paymentsList,
    payments,
    (p) => `
      <div class="list-row">
        <div class="list-main">
          <strong>${p.purpose}</strong>
          <small>${formatSats(p.amount_sats)} · ${satsToUsd(p.amount_sats)} · ${timeLabel(p.created_at)}</small>
        </div>
        <span class="tag tag-${p.approval_type}">${p.approval_type}</span>
      </div>
    `,
    "No payments yet."
  );
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function renderAudit(audit) {
  renderList(
    auditList,
    audit,
    (entry) => `
      <div class="list-row">
        <div class="list-main">
          <div class="audit-head">
            <span class="tool-badge tool-${entry.tool}">${entry.tool}</span>
            ${entry.duration_ms ? `<span class="duration">${entry.duration_ms}ms</span>` : ""}
          </div>
          <small>${entry.params_summary}</small>
          <p>${entry.outcome} · ${timeLabel(entry.timestamp)}</p>
        </div>
      </div>
    `,
    "No audit events yet."
  );
}

// ── Generic list renderer ──────────────────────────────────────────────────────

function renderList(container, items, renderItem, emptyText) {
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<article class="list-item"><p class="muted">${emptyText}</p></article>`;
    return;
  }
  for (const item of items) {
    const article = document.createElement("article");
    article.className = "list-item";
    article.innerHTML = renderItem(item);
    container.append(article);
  }
}

// ── WebSocket event rendering ──────────────────────────────────────────────────

const eventConfig = {
  payment_made: {
    icon: "⚡",
    label: "Payment made",
    color: "event-payment",
    detail: (d) =>
      `${formatSats(d.amount_sats)} · ${d.amount_usd || satsToUsd(d.amount_sats || 0)} — ${d.purpose || ""}`,
  },
  approval_requested: {
    icon: "🔔",
    label: "Approval needed",
    color: "event-approval",
    detail: (d) =>
      `${formatSats(d.amount_sats)} · ${d.amount_usd || satsToUsd(d.amount_sats || 0)} — ${d.reason || ""}`,
  },
  topup_approved: {
    icon: "✅",
    label: "Top-up approved",
    color: "event-topup",
    detail: (d) =>
      `New balance: ${formatSats(d.new_balance_sats)} · ${d.new_balance_usd || satsToUsd(d.new_balance_sats || 0)}`,
  },
  approval_denied: {
    icon: "🚫",
    label: "Approval denied",
    color: "event-denied",
    detail: (d) => d.reason || "Payment denied",
  },
};

function prependEvent(event) {
  // Suppress internal handshake events from the WS server
  if (event.event === "connected") return;

  const cfg = eventConfig[event.event] || {
    icon: "·",
    label: event.event,
    color: "",
    detail: (d) => JSON.stringify(d),
  };

  const ts = event.timestamp || new Date().toISOString();
  const article = document.createElement("article");
  article.className = `list-item event-item ${cfg.color}`;
  article.innerHTML = `
    <div class="event-row">
      <span class="event-icon" aria-hidden="true">${cfg.icon}</span>
      <div class="list-main">
        <strong>${cfg.label}</strong>
        <small>${cfg.detail(event.data || {})}</small>
        <p>${timeLabel(ts)}</p>
      </div>
    </div>
  `;

  eventsList.prepend(article);
  while (eventsList.children.length > 6) {
    eventsList.removeChild(eventsList.lastElementChild);
  }

  // Side effects: auto-refresh and approval modal
  if (event.event === "payment_made" || event.event === "topup_approved") {
    loadDashboard();
  }
  if (event.event === "approval_requested") {
    showApprovalModal(event.data || {});
  }
}

// ── Approval modal ─────────────────────────────────────────────────────────────

function showApprovalModal(data) {
  pendingApproval = data;
  modalReason.textContent = data.reason || "Claude is requesting approval for a payment.";
  modalAmountSats.textContent = formatSats(data.amount_sats || 0);
  modalAmountUsd.textContent = data.amount_usd || satsToUsd(data.amount_sats || 0);
  approvalModal.classList.remove("hidden");
}

function hideApprovalModal() {
  approvalModal.classList.add("hidden");
  pendingApproval = null;
}

modalApprove.addEventListener("click", async () => {
  const d = pendingApproval || {};
  hideApprovalModal();
  await fetch("/dev/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential_id: "user_1",
      event: "payment_made",
      data: {
        amount_sats: d.amount_sats,
        amount_usd: d.amount_usd || satsToUsd(d.amount_sats || 0),
        purpose: d.reason || "Approved payment",
        approval_type: "manual",
      },
    }),
  });
});

modalDeny.addEventListener("click", async () => {
  hideApprovalModal();
  await fetch("/dev/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential_id: "user_1",
      event: "approval_denied",
      data: { reason: "User denied the payment request." },
    }),
  });
});

// Close modal when clicking the backdrop
approvalModal.addEventListener("click", (e) => {
  if (e.target === approvalModal) hideApprovalModal();
});

// ── Demo controls ──────────────────────────────────────────────────────────────

const demoPayloads = {
  payment_made: {
    amount_sats: 6400,
    amount_usd: satsToUsd(6400),
    purpose: "Demo payment for API access",
    approval_type: "auto",
  },
  approval_requested: {
    approval_id: "apr_demo",
    amount_sats: 22000,
    amount_usd: satsToUsd(22000),
    reason: "Domain renewal for demo project",
  },
  topup_approved: {
    new_balance_sats: 67000,
    new_balance_usd: satsToUsd(67000),
  },
};

// ── Quick demo ─────────────────────────────────────────────────────────────────

const quickDemoButton = document.querySelector("#quickDemoButton");

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function emitEvent(event, data) {
  await fetch("/dev/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential_id: "user_1", event, data }),
  });
}

quickDemoButton.addEventListener("click", async () => {
  quickDemoButton.disabled = true;
  quickDemoButton.textContent = "Running…";

  // Step 1: auto-approved payment
  await emitEvent("payment_made", demoPayloads.payment_made);
  await sleep(1800);

  // Step 2: approval requested — modal will pop up for user to approve/deny
  await emitEvent("approval_requested", demoPayloads.approval_requested);
  await sleep(3500);

  // Step 3: budget top-up
  await emitEvent("topup_approved", demoPayloads.topup_approved);

  quickDemoButton.textContent = "Done ✓";
  await sleep(1500);
  quickDemoButton.disabled = false;
  quickDemoButton.textContent = "Run quick demo";
});

refreshButton.addEventListener("click", loadDashboard);

document.querySelectorAll("[data-event]").forEach((button) => {
  const originalText = button.textContent;
  button.addEventListener("click", async () => {
    const event = button.getAttribute("data-event");
    button.disabled = true;
    button.textContent = "Sent ✓";
    await emitEvent(event, demoPayloads[event]);
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1200);
  });
});

// ── WebSocket ──────────────────────────────────────────────────────────────────

function connectWs() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=ws_user_1`);

  socket.addEventListener("open", () => {
    wsBadge.textContent = "Live";
    wsBadge.className = "status-badge status-live";
  });

  socket.addEventListener("message", (message) => {
    prependEvent(JSON.parse(message.data));
  });

  socket.addEventListener("close", () => {
    wsBadge.textContent = "Reconnecting…";
    wsBadge.className = "status-badge status-waiting";
    window.setTimeout(connectWs, 1500);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────
loadDashboard();
connectWs();
