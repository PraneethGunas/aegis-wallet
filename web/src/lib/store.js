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
import * as ws from "./ws";

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
    isPaired: false,
    isActive: false,
    budgetSats: 0,
    spentSats: 0,
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

  // ── Prove wallet ownership to backend (register pubkey + sign proof) ───────
  async function proveWallet(walletId) {
    const signingPubKey = bitcoin.getAuthPublicKey();
    const timestamp = new Date().toISOString();
    const sig = bitcoin.signProof(walletId, timestamp);

    // Register/migrate signing pubkey (idempotent)
    await api.wallet.create(walletId, signingPubKey);

    // Prove ownership → get session token
    const result = await api.wallet.prove(walletId, sig, timestamp);
    if (result?.token) api.setAuthToken(result.token);
  }

  const createWallet = useCallback(async () => {
    try {
      dispatch({ type: "CLEAR_ERROR" });

      // Guard: if wallet exists, authenticate instead of creating a new one
      if (passkey.hasExistingWallet()) {
        return authenticate();
      }

      const { credentialId, entropy } = await passkey.createWallet();

      // Derive keys from PRF entropy (deterministic: same entropy = same keys always)
      const { fundingKey } = bitcoin.deriveKeys(entropy);
      const fundingAddress = bitcoin.getFundingAddress(fundingKey);

      // Register signing pubkey + prove ownership → get session token
      try {
        await proveWallet(credentialId);
      } catch {
        // Backend offline — L1 still works without it
      }

      localStorage.setItem("aegis_funding_address", fundingAddress);

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });

      ws.connect();
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

      // Prove wallet ownership → get session token
      try {
        await proveWallet(credentialId);
      } catch (err) {
        console.warn("Backend auth failed:", err.message);
      }

      localStorage.setItem("aegis_funding_address", fundingAddress);

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });

      ws.connect();
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

      try {
        await proveWallet(credentialId);
      } catch (err) {
        console.warn("Backend auth failed:", err.message);
      }

      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress,
      });

      ws.connect();
      return { credentialId, fundingAddress };
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: err.message });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    bitcoin.discardKeys();
    passkey.clearCredential();
    api.setAuthToken(null);
    localStorage.removeItem("aegis_funding_address");
    localStorage.removeItem("aegis_cached_balance");
    ws.disconnect();
    dispatch({ type: "LOGOUT" });
  }, []);

  // --- Data Fetching ---

  const fetchBalance = useCallback(async () => {
    dispatch({ type: "SET_LOADING", key: "balance", value: true });
    try {
      // L1: query mempool.space directly from browser (no backend needed)
      let addresses;
      try {
        addresses = bitcoin.getAllFundingAddresses();
      } catch {
        const cached = localStorage.getItem("aegis_funding_address");
        addresses = cached ? [cached] : [];
      }

      // L1 + L2 in parallel (BTC price from store, fetched separately)
      const [l1Result, l2Result] = await Promise.allSettled([
        addresses.length > 0
          ? mempool.getMultiAddressBalance(addresses)
          : Promise.resolve({ confirmed_sats: 0, unconfirmed_sats: 0 }),
        api.getAuthToken()
          ? api.wallet.getL2Balance().catch(() => ({ l2Sats: 0 }))
          : Promise.resolve({ l2Sats: 0 }),
      ]);

      const l1Sats = l1Result.status === "fulfilled" ? l1Result.value.confirmed_sats : 0;
      const l1Unconfirmed = l1Result.status === "fulfilled" ? l1Result.value.unconfirmed_sats : 0;
      const l2Sats = l2Result.status === "fulfilled" ? (l2Result.value.l2Sats ?? 0) : 0;

      // Get price — use store value, or fetch fresh if not available yet
      let price = state.btcPrice;
      if (!price) {
        try {
          const priceData = await api.wallet.getBtcPrice();
          price = priceData.btcPrice || 0;
          if (price) dispatch({ type: "SET_BTC_PRICE", price });
        } catch {
          price = 0;
        }
      }


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

      // Cache for next load
      try {
        localStorage.setItem("aegis_cached_balance", JSON.stringify({
          ...balance,
          btcPrice: price,
          ts: Date.now(),
        }));
      } catch {}
    } catch (err) {
      if (err.status !== 401) {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    } finally {
      dispatch({ type: "SET_LOADING", key: "balance", value: false });
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    dispatch({ type: "SET_LOADING", key: "transactions", value: true });
    try {
      let addresses;
      try {
        addresses = bitcoin.getAllFundingAddresses().join(",");
      } catch {
        addresses = localStorage.getItem("aegis_funding_address") || "";
      }
      const data = await api.wallet.getHistory(200, addresses);
      dispatch({
        type: "SET_TRANSACTIONS",
        transactions: data.transactions ?? [],
      });
    } catch (err) {
      if (err.status !== 401) {
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    } finally {
      dispatch({ type: "SET_LOADING", key: "transactions", value: false });
    }
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    dispatch({ type: "SET_LOADING", key: "agent", value: true });
    try {
      const data = await api.agent.status();
      dispatch({
        type: "SET_AGENT",
        agent: {
          isPaired: data.isPaired ?? false,
          isActive: data.isActive ?? false,
          budgetSats: data.budgetSats ?? 0,
          spentSats: data.spentSats ?? 0,
          connectedSince: data.connectedSince ?? null,
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

  const fetchBtcPrice = useCallback(async () => {
    try {
      const data = await api.wallet.getBtcPrice();
      if (data.btcPrice) {
        dispatch({ type: "SET_BTC_PRICE", price: data.btcPrice });
      }
    } catch {
      // Keep fallback price
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
        fetchBalance();
        fetchTransactions();
        return result;
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: `Payment failed: ${err.message}` });
      }
    },
    [fetchBalance, fetchTransactions]
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

  // --- WebSocket Event Handlers ---

  useEffect(() => {
    const unsubs = [
      ws.on("balance_updated", (data) => {
        dispatch({
          type: "SET_BALANCE",
          balance: {
            l1Sats: data.l1Sats,
            l2Sats: data.l2Sats,
            l1Usd: data.l1Usd,
            l2Usd: data.l2Usd,
            totalUsd: data.totalUsd,
            totalBtc: data.totalBtc,
          },
        });
      }),

      ws.on("payment_made", () => {
        // Refresh transactions and balance
        fetchBalance();
        fetchTransactions();
      }),

      ws.on("approval_requested", (data) => {
        dispatch({ type: "SET_PENDING_APPROVAL", approval: data });
      }),

      ws.on("approval_resolved", () => {
        dispatch({ type: "CLEAR_PENDING_APPROVAL" });
        fetchBalance();
      }),

      ws.on("payment_failed", (data) => {
        dispatch({
          type: "SET_PENDING_APPROVAL",
          approval: {
            type: "payment",
            bolt11: data.bolt11,
            amountSats: data.amount_sats,
            reason: data.purpose || data.description || "Agent's budget exceeded",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        });
      }),

      ws.on("payment_completed", () => {
        dispatch({ type: "CLEAR_PENDING_APPROVAL" });
        fetchBalance();
        fetchTransactions();
      }),

      ws.on("topup_requested", (data) => {
        dispatch({
          type: "SET_PENDING_APPROVAL",
          approval: { ...data, type: "topup" },
        });
      }),

      ws.on("topup_approved", () => {
        dispatch({ type: "CLEAR_PENDING_APPROVAL" });
        fetchAgentStatus();
        fetchBalance();
      }),

      ws.on("agent_paused", () => {
        dispatch({ type: "SET_AGENT", agent: { isActive: false } });
      }),

      ws.on("channel_opening", () => {
        dispatch({ type: "SET_FUNDING_STEP", funding: { step: "opening_channel" } });
      }),

      ws.on("channel_confirmed", () => {
        dispatch({ type: "SET_FUNDING_STEP", funding: { step: "ready" } });
        fetchBalance();
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [fetchBalance, fetchTransactions, fetchAgentStatus]);

  // Restore session on mount — re-auth via passkey to reload keys into memory
  // Skip on landing page (/) — user will auth through onboarding buttons
  useEffect(() => {
    const credentialId = passkey.getCredentialId();
    const isLandingPage = typeof window !== "undefined" && window.location.pathname === "/";

    if (credentialId && !isLandingPage) {
      // Show cached address immediately while re-auth happens
      const cachedAddress = localStorage.getItem("aegis_funding_address");
      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress: cachedAddress,
      });

      // Hydrate last-known balance so UI doesn't flash $0.00
      try {
        const cached = JSON.parse(localStorage.getItem("aegis_cached_balance"));
        if (cached) {
          dispatch({ type: "SET_BALANCE", balance: cached });
          if (cached.btcPrice) dispatch({ type: "SET_BTC_PRICE", price: cached.btcPrice });
        }
      } catch {}
      dispatch({ type: "SET_LOADING", key: "balance", value: true });

      // Silently re-authenticate to reload keys into memory
      (async () => {
        try {
          const { entropy } = await passkey.authenticate();
          const { fundingKey } = bitcoin.deriveKeys(entropy);
          const fundingAddress = bitcoin.getFundingAddress(fundingKey);
          localStorage.setItem("aegis_funding_address", fundingAddress);
          dispatch({
            type: "SET_AUTHENTICATED",
            credentialId,
            fundingAddress,
          });

          // Prove wallet ownership → get session token
          try {
            await proveWallet(credentialId);
          } catch (err) {
            console.warn("Backend auth failed:", err.message);
          }

          ws.connect();
          // Only fetch if we have a valid token
          if (api.getAuthToken()) {
            fetchBalance();
            fetchTransactions();
            fetchAgentStatus();
          }
        } catch {
          // Auth failed/cancelled — show cached data, don't fire API calls without token
        }
      })();
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

  // Fetch BTC price on mount and every 60s
  useEffect(() => {
    fetchBtcPrice();
    const interval = setInterval(fetchBtcPrice, 60000);
    return () => clearInterval(interval);
  }, [fetchBtcPrice]);

  const value = {
    ...state,
    createWallet,
    authenticate,
    recoverWallet,
    logout,
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
