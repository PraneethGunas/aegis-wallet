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
    autoPayLimitSats: 250, // $2.50 default at ~$62k
    connectedSince: null,
  },

  // Transactions
  transactions: [],

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

      // Guard: if wallet exists, authenticate instead of creating a new one
      if (passkey.hasExistingWallet()) {
        return authenticate();
      }

      const { credentialId, publicKey, entropy } = await passkey.createWallet();

      // Derive keys from PRF entropy (deterministic: same entropy = same keys always)
      const { fundingKey, authKey } = bitcoin.deriveKeys(entropy);
      const fundingAddress = bitcoin.getFundingAddress(fundingKey);
      const authPubKey = bitcoin.getAuthPublicKey(authKey);

      // Register with backend
      const result = await api.wallet.create(credentialId, authPubKey);
      if (result?.token) {
        api.setAuthToken(result.token);
      }

      // Persist funding address — public data, safe for localStorage
      localStorage.setItem("aegis_funding_address", fundingAddress);
      localStorage.setItem("aegis_credential_id", credentialId);
      localStorage.setItem("aegis_auth_pubkey", authPubKey);

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

      // Get auth token from backend
      const result = await api.wallet.create(credentialId, bitcoin.getAuthPublicKey());
      if (result?.token) {
        api.setAuthToken(result.token);
      } else {
        api.setAuthToken(credentialId);
      }

      // Persist funding address — will be identical to previous derivation
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

  const logout = useCallback(() => {
    bitcoin.discardKeys();
    passkey.clearCredential();
    api.setAuthToken(null);
    localStorage.removeItem("aegis_funding_address");
    ws.disconnect();
    dispatch({ type: "LOGOUT" });
  }, []);

  // --- Data Fetching ---

  const fetchBalance = useCallback(async () => {
    dispatch({ type: "SET_LOADING", key: "balance", value: true });
    try {
      // Pass ALL derived addresses so backend aggregates balance across all indices
      let addresses;
      try {
        addresses = bitcoin.getAllFundingAddresses().join(",");
      } catch {
        addresses = localStorage.getItem("aegis_funding_address") || "";
      }
      const data = await api.wallet.getBalance(addresses);
      dispatch({
        type: "SET_BALANCE",
        balance: {
          l1Sats: data.l1Sats ?? 0,
          l1Unconfirmed: data.l1Unconfirmed ?? 0,
          l2Sats: data.l2Sats ?? 0,
          l1Usd: data.l1Usd ?? 0,
          l2Usd: data.l2Usd ?? 0,
          totalUsd: data.totalUsd ?? 0,
          totalBtc: data.totalBtc ?? 0,
        },
      });
      if (data.btcPrice) {
        dispatch({ type: "SET_BTC_PRICE", price: data.btcPrice });
      }
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
      const data = await api.wallet.getHistory(20, addresses);
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
          autoPayLimitSats: data.autoPayLimitSats ?? 250,
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
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
      );
      const data = await res.json();
      if (data.bitcoin?.usd) {
        dispatch({ type: "SET_BTC_PRICE", price: data.bitcoin.usd });
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
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [fetchBalance, fetchTransactions, fetchAgentStatus]);

  // Restore session on mount — re-auth via passkey to reload keys into memory
  useEffect(() => {
    const credentialId = passkey.getCredentialId();
    const token = api.getAuthToken();
    if (credentialId && token) {
      // Show cached address immediately while re-auth happens
      const cachedAddress = localStorage.getItem("aegis_funding_address");
      dispatch({
        type: "SET_AUTHENTICATED",
        credentialId,
        fundingAddress: cachedAddress,
      });

      // Silently re-authenticate to reload keys into memory
      // This triggers a biometric prompt — keys are needed for address derivation
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
          ws.connect();
          fetchBalance();
          fetchTransactions();
          fetchAgentStatus();
        } catch {
          // Auth failed/cancelled — still show cached data, just can't derive new addresses
          ws.connect();
          fetchBalance();
          fetchTransactions();
          fetchAgentStatus();
        }
      })();
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
    logout,
    fetchBalance,
    fetchTransactions,
    fetchAgentStatus,
    approveRequest,
    denyRequest,
    pauseAgent,
    resumeAgent,
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
