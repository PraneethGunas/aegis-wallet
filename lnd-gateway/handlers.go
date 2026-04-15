package main

import "net/http"

func registerHandlers(mux *http.ServeMux, lnd *LNDConn, litd *LitdClient) {
	// Node
	mux.HandleFunc("GET /v1/node/info", handleGetInfo(lnd))

	// Balance
	mux.HandleFunc("GET /v1/balance/channel", handleChannelBalance(lnd))
	mux.HandleFunc("GET /v1/balance/wallet", handleWalletBalance(lnd))

	// Payments
	mux.HandleFunc("POST /v1/payments/send", handleSendPayment(lnd))
	mux.HandleFunc("POST /v1/payments/decode", handleDecodeInvoice(lnd))
	mux.HandleFunc("GET /v1/payments/list", handleListPayments(lnd))

	// Invoices
	mux.HandleFunc("POST /v1/invoices/add", handleAddInvoice(lnd))

	// Addresses
	mux.HandleFunc("POST /v1/addresses/new", handleNewAddress(lnd))

	// On-chain
	mux.HandleFunc("POST /v1/onchain/send", handleSendCoins(lnd))
	mux.HandleFunc("POST /v1/onchain/publish", handlePublishTx(lnd))
	mux.HandleFunc("GET /v1/onchain/utxos", handleListUnspent(lnd))
	mux.HandleFunc("GET /v1/onchain/transactions", handleGetTransactions(lnd))

	// Channels
	mux.HandleFunc("POST /v1/channels/connect-peer", handleConnectPeer(lnd))
	mux.HandleFunc("GET /v1/channels/peers", handleListPeers(lnd))
	mux.HandleFunc("POST /v1/channels/open", handleOpenChannel(lnd))
	mux.HandleFunc("GET /v1/channels/list", handleListChannels(lnd))
	mux.HandleFunc("GET /v1/channels/pending", handlePendingChannels(lnd))

	// Macaroons
	mux.HandleFunc("POST /v1/macaroons/bake-agent", handleBakeAgentMacaroon(lnd))

	// litd accounts
	if litd != nil {
		mux.HandleFunc("POST /v1/litd/accounts/create", handleCreateAccount(litd))
		mux.HandleFunc("GET /v1/litd/accounts", handleListAccounts(litd))
		mux.HandleFunc("POST /v1/litd/accounts/update/", handleUpdateBalance(litd))
		mux.HandleFunc("DELETE /v1/litd/accounts/", handleFreezeAccount(litd))
	}
}
