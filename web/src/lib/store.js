"use client";

/**
 * Wallet state context — shared across all pages.
 *
 * Manages: authentication state, balances, BTC price,
 * agent status, and WebSocket connection lifecycle.
 */

import { createContext, useContext, useCallback, useEffect, useReducer } from "react";
import * as passkey from "./passkey";
import * as bitcoin from "./bitcoin";
import * as mempool from "./mempool";
import * as api from "./api";
// WebSocket removed — no server-side push needed for self-custodial wallet

const WalletContext = createContext(null);

const initialState = {
  // Auth
  isAuthenticated: false,
  credentialId: null,

  // Keys (transient — never persisted)
  fundingAddress: null,

  // Balances
  balance: {
    l1Sats: 0,
    l1Unconfirmed: 0,
    l2Sats: 0,
    l1Usd: 0,
    l2Usd: 0,
    totalUsd: 0,
    totalBtc: 0,
  },

  // BTC price
  btcPrice: 0, // fetched from CoinGecko on mount

  // Agent
  agent: {
    id: null,
    isPaired: false,
    isActive: false,
    budgetSats: 0,
    balanceSats: 0,
    spentSats: 0,
    macaroon: null,
    connectedSince: null,
  },

  // Transactions
  transactions: [],

  // L1→L2 funding pipeline
  funding: {
    step: "idle", // idle | signing | broadcasting | confirming | opening_channel | ready | error
    txid: null,
    error: null,
  },

  // Pending approval (from WebSocket)
  pendingApproval: null,

  // Loading states
  loading: {
    balance: false,
    transactions: false,
    agent: false,
  },

  // Error
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_AUTHENTICATED":
      return {
        ...state,
        isAuthenticated: true,
        credentialId: action.credentialId,
        fundingAddress: action.fundingAddress,
      };

    case "SET_BALANCE":
      return { ...state, balance: { ...state.balance, ...action.balance } };

    case "SET_BTC_PRICE":
      return { ...state, btcPrice: action.price };

    case "SET_AGENT":
      return { ...state, agent: { ...state.agent, ...action.agent } };

    case "SET_TRANSACTIONS":
      return { ...state, transactions: action.transactions };

    case "SET_FUNDING_STEP":
      return { ...state, funding: { ...state.funding, ...action.funding } };

    case "RESET_FUNDING":
      return { ...state, funding: { step: "idle", txid: null, error: null } };

    case "SET_PENDING_APPROVAL":
      return { ...state, pendingApproval: action.approval };

    case "CLEAR_PENDING_APPROVAL":
      return { ...state, pendingApproval: null };

    case "SET_LOADING":
      return {
        ...state,
        loading: { ...state.loading, [action.key]: action.value },
      };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "LOGOUT":
      return { ...initialState };

    default:
      return state;
  }
}

export function WalletProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // --- Auth Actions ---

  const createWallet = useCallback(async () => {
    try {
      dispatch({ type: "CLEAR_ERROR" });

      if (passkey.hasExistingWallet()) {
        return authenticate();
      }

      const { credentialId, entropy } = await passkey.createWallet();
      const { fundingKey } = bitcoin.deriveKeys(entropy);
      const fundingAddress = bitcoin.getFundingAddress(fundingKey);

      localStorage.setItem("aegis_funding_address", fundingAddress);

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });


      return { credentialId, fundingAddress };
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
      throw err;
    }
  }, []);

  const authenticate = useCallback(async () => {
    try {
      dispatch({ type: "CLEAR_ERROR" });
      const { credentialId, entropy } = await passkey.authenticate();

      // Re-derive keys — PRF is deterministic, so same credential + salt = same keys
      const { fundingKey } = bitcoin.deriveKeys(entropy);
      const fundingAddress = bitcoin.getFundingAddress(fundingKey);

      localStorage.setItem("aegis_funding_address", fundingAddress);

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });


      return { credentialId, fundingAddress };
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
      throw err;
    }
  }, []);

  const recoverWallet = useCallback(async () => {
    try {
      dispatch({ type: "CLEAR_ERROR" });
      const { credentialId, entropy } = await passkey.recoverWallet();

      const { fundingKey } = bitcoin.deriveKeys(entropy);
      const fundingAddress = bitcoin.getFundingAddress(fundingKey);

      // Check if this address has funds before committing
      const { confirmed_sats, unconfirmed_sats } = await mempool.getAddressBalance(fundingAddress);

      if (confirmed_sats === 0 && unconfirmed_sats === 0) {
        bitcoin.discardKeys();
        const tryAgain = window.confirm(
          `Wrong passkey — this one has 0 sats.\n\nAddress: ${fundingAddress}\n\nTry another passkey?`
        );
        if (tryAgain) return recoverWallet();
        return null;
      }

      // Right wallet — commit the credential
      passkey.confirmRecovery(credentialId);
      localStorage.setItem("aegis_funding_address", fundingAddress);

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });


      return { credentialId, fundingAddress };
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    bitcoin.discardKeys();
    passkey.clearCredential();
    localStorage.removeItem("aegis_funding_address");
    localStorage.removeItem("aegis_cached_balance");

    dispatch({ type: "LOGOUT" });
  }, []);

  // --- Data Fetching ---

  // ── Sync: fetches everything in one call ──────────────────────────────────
  // 1. BTC price (needed for USD conversion)
  // 2. L1 balance (mempool.space, direct from browser)
  // 3. L2 balance (LND via backend)
  // 4. Agent/account status (litd via backend)
  // 5. Transaction history (LND via backend)
  const syncWallet = useCallback(async () => {
    dispatch({ type: "SET_LOADING", key: "balance", value: true });
    try {
      // 1. BTC price first — everything else needs it
      let price = state.btcPrice;
      try {
        const priceData = await api.wallet.getBtcPrice();
        price = priceData.btcPrice || price || 0;
        if (price) dispatch({ type: "SET_BTC_PRICE", price });
      } catch {}

      // 2 + 3 + 4 + 5 in parallel
      let addresses;
      try {
        addresses = bitcoin.getAllFundingAddresses();
      } catch {
        const cached = localStorage.getItem("aegis_funding_address");
        addresses = cached ? [cached] : [];
      }

      const [l1Result, l2Result, agentResult, txResult, pendingResult] = await Promise.allSettled([
        addresses.length > 0
          ? mempool.getMultiAddressBalance(addresses)
          : Promise.resolve({ confirmed_sats: 0, unconfirmed_sats: 0 }),
        api.wallet.getL2Balance().catch(() => ({ l2Sats: 0 })),
        api.agent.status().catch(() => ({ agent: null })),
        api.wallet.getHistory(200).catch(() => ({ transactions: [] })),
        api.agent.getPendingInvoices().catch(() => ({ invoices: [] })),
      ]);

      // L1 + L2 balance
      const l1Sats = l1Result.status === "fulfilled" ? l1Result.value.confirmed_sats : 0;
      const l1Unconfirmed = l1Result.status === "fulfilled" ? l1Result.value.unconfirmed_sats : 0;
      const l2Sats = l2Result.status === "fulfilled" ? (l2Result.value.l2Sats ?? 0) : 0;
      const totalSats = l1Sats + l2Sats;

      const balance = {
        l1Sats,
        l1Unconfirmed,
        l2Sats,
        l1Usd: +((l1Sats / 1e8) * price).toFixed(2),
        l2Usd: +((l2Sats / 1e8) * price).toFixed(2),
        totalUsd: +((totalSats / 1e8) * price).toFixed(2),
        totalBtc: +(totalSats / 1e8).toFixed(8),
      };
      dispatch({ type: "SET_BALANCE", balance });

      // Agent status
      if (agentResult.status === "fulfilled") {
        const a = agentResult.value.agent;
        dispatch({
          type: "SET_AGENT",
          agent: {
            id: a?.id ?? null,
            isPaired: !!a,
            isActive: a?.status === "active",
            budgetSats: a?.budgetSats ?? 0,
            balanceSats: a?.balanceSats ?? 0,
            spentSats: a?.spentTodaySats ?? 0,
            macaroon: a?.macaroon ?? null,
            connectedSince: a?.createdAt ?? null,
          },
        });
      }

      // Transactions
      if (txResult.status === "fulfilled") {
        dispatch({
          type: "SET_TRANSACTIONS",
          transactions: txResult.value.transactions ?? [],
        });
      }

      // Pending invoices (from webhook — agent payment failures)
      if (pendingResult.status === "fulfilled") {
        const invoices = pendingResult.value.invoices || [];
        if (invoices.length > 0) {
          const latest = invoices[invoices.length - 1];
          dispatch({
            type: "SET_PENDING_APPROVAL",
            approval: {
              type: "payment",
              bolt11: latest.bolt11,
              amountSats: latest.amount_sats,
              reason: latest.description || latest.error || "Agent payment failed",
            },
          });
        }
      }

      // Cache for next load
      try {
        localStorage.setItem("aegis_cached_balance", JSON.stringify({
          ...balance, btcPrice: price, ts: Date.now(),
        }));
      } catch {}
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
    } finally {
      dispatch({ type: "SET_LOADING", key: "balance", value: false });
    }
  }, [state.btcPrice]);

  // Keep old names as aliases so dashboard doesn't break
  const fetchBalance = syncWallet;
  const fetchTransactions = syncWallet;
  const fetchAgentStatus = useCallback(async () => {
    try {
      const data = await api.agent.status();
      const a = data.agent;
      dispatch({
        type: "SET_AGENT",
        agent: {
          id: a?.id ?? null,
          isPaired: !!a,
          isActive: a?.status === "active",
          budgetSats: a?.budgetSats ?? 0,
          balanceSats: a?.balanceSats ?? 0,
          spentSats: a?.spentTodaySats ?? 0,
          macaroon: a?.macaroon ?? null,
          connectedSince: a?.createdAt ?? null,
        },
      });
    } catch (err) {
      if (err.status !== 401) {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    } finally {
      dispatch({ type: "SET_LOADING", key: "agent", value: false });
    }
  }, []);


  // --- Agent Actions ---

  const approveRequest = useCallback(
    async (requestId) => {
      try {
        await api.agent.approve(requestId, true);
        dispatch({ type: "CLEAR_PENDING_APPROVAL" });
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    },
    []
  );

  const denyRequest = useCallback(
    async (requestId) => {
      try {
        await api.agent.approve(requestId, false);
        dispatch({ type: "CLEAR_PENDING_APPROVAL" });
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    },
    []
  );

  const dismissApproval = useCallback(() => {
    dispatch({ type: "CLEAR_PENDING_APPROVAL" });
  }, []);

  const payDirect = useCallback(
    async (bolt11) => {
      dispatch({ type: "CLEAR_PENDING_APPROVAL" });
      try {
        const result = await api.agent.payDirect(bolt11);
        await api.agent.clearPendingInvoice(bolt11).catch(() => {});
        syncWallet();
        return result;
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: `Payment failed: ${err.message}` });
      }
    },
    [syncWallet]
  );

  const pauseAgent = useCallback(async () => {
    try {
      await api.agent.pause();
      dispatch({ type: "SET_AGENT", agent: { isActive: false } });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, []);

  const resumeAgent = useCallback(async () => {
    try {
      await api.agent.resume();
      dispatch({ type: "SET_AGENT", agent: { isActive: true } });
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, []);

  // --- L1→L2 Funding Pipeline ---

  const fundAgent = useCallback(async (amountSats) => {
    try {
      dispatch({ type: "SET_FUNDING_STEP", funding: { step: "signing", error: null } });

      // 1. Fetch data from APIs (before passkey prompt)
      const depositRes = await api.ln.getDepositAddress();
      const lndAddress = depositRes.address;

      // Get UTXOs from the primary funding address
      const userAddress = localStorage.getItem("aegis_funding_address");
      if (!userAddress) throw new Error("No funding address. Create wallet first.");
      const { utxos } = await api.wallet.getUtxos(userAddress);

      if (!utxos || utxos.length === 0) {
        throw new Error("No funds available in savings wallet");
      }

      const totalAvailable = utxos.reduce((sum, u) => sum + u.value, 0);
      if (totalAvailable < amountSats + 1000) {
        throw new Error(`Insufficient funds: have ${totalAvailable.toLocaleString()} sats, need ~${(amountSats + 1000).toLocaleString()} sats (including fees)`);
      }

      // 2. Load keys — triggers passkey biometric
      const btcMod = await import("@/lib/bitcoin");
      if (!btcMod.isKeysLoaded()) {
        const { entropy } = await passkey.authenticate();
        btcMod.deriveKeys(entropy);
      }

      // 3. Build and sign PSBT
      const psbtHex = btcMod.createFundLNTransaction(null, lndAddress, amountSats, utxos, 5);
      const signedTxHex = btcMod.signTransaction(psbtHex);

      // 4. Broadcast
      dispatch({ type: "SET_FUNDING_STEP", funding: { step: "broadcasting" } });
      await api.ln.fund(signedTxHex);

      dispatch({ type: "SET_FUNDING_STEP", funding: { step: "confirming" } });

      // Poll mempool for confirmation, then open channel
      const pollConfirmation = setInterval(async () => {
        try {
          const status = await api.ln.getNodeStatus();
          if (status.onchainConfirmedSats > 0) {
            clearInterval(pollConfirmation);
            dispatch({ type: "SET_FUNDING_STEP", funding: { step: "opening_channel" } });
            try {
              await api.ln.openChannel(amountSats);
              // channel_confirmed will come via WebSocket
            } catch (err) {
              dispatch({ type: "SET_FUNDING_STEP", funding: { step: "error", error: err.message } });
            }
          }
        } catch {}
      }, 15000);

      // Cap polling
      setTimeout(() => clearInterval(pollConfirmation), 30 * 60 * 1000);
    } catch (err) {
      dispatch({ type: "SET_FUNDING_STEP", funding: { step: "error", error: err.message } });
    }
  }, []);

  const resetFunding = useCallback(() => {
    dispatch({ type: "RESET_FUNDING" });
  }, []);

  // Restore session on mount — use cached address, no passkey prompt
  // Passkey only needed when signing transactions (L1 sends)
  useEffect(() => {
    const credentialId = passkey.getCredentialId();
    const isLandingPage = typeof window !== "undefined" && window.location.pathname === "/";

    if (credentialId && !isLandingPage) {
      const cachedAddress = localStorage.getItem("aegis_funding_address");
      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress: cachedAddress,
      });

      // Hydrate cached balance so UI doesn't flash $0.00
      try {
        const cached = JSON.parse(localStorage.getItem("aegis_cached_balance"));
        if (cached) {
          dispatch({ type: "SET_BALANCE", balance: cached });
          if (cached.btcPrice) dispatch({ type: "SET_BTC_PRICE", price: cached.btcPrice });
        }
      } catch {}

      // Sync fresh data (no passkey needed — uses cached address for L1)
      syncWallet();
    } else if (credentialId && isLandingPage) {
      // On landing page: just set cached state, no passkey prompt
      const cachedAddress = localStorage.getItem("aegis_funding_address");
      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress: cachedAddress,
      });
    }
  }, []);

  const value = {
    ...state,
    createWallet,
    authenticate,
    recoverWallet,
    logout,
    syncWallet,
    fetchBalance,
    fetchTransactions,
    fetchAgentStatus,
    approveRequest,
    denyRequest,
    dismissApproval,
    payDirect,
    pauseAgent,
    resumeAgent,
    fundAgent,
    resetFunding,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
