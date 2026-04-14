package main

import (
	"flag"
	"os"
)

type Config struct {
	ListenAddr      string
	LNDSocket       string
	TLSCertPath     string
	MacaroonPath    string
	LitdHost        string
	LitMacaroonPath string
	Network         string
}

func ParseConfig() Config {
	cfg := Config{}

	flag.StringVar(&cfg.ListenAddr, "listen", envOr("LND_GATEWAY_LISTEN", ":3003"), "HTTP listen address")
	flag.StringVar(&cfg.LNDSocket, "lnd-socket", envOr("LND_GRPC_HOST", "localhost:10009"), "LND gRPC address")
	flag.StringVar(&cfg.TLSCertPath, "tls-cert", envOr("LND_CERT_PATH", "./certs/tls.cert"), "Path to LND TLS cert")
	flag.StringVar(&cfg.MacaroonPath, "macaroon", envOr("LND_MACAROON_PATH", "./certs/admin.macaroon"), "Path to admin macaroon")
	flag.StringVar(&cfg.LitdHost, "litd-host", envOr("LITD_HOST", "https://localhost:8443"), "litd HTTP address")
	flag.StringVar(&cfg.LitMacaroonPath, "lit-macaroon", envOr("LIT_MACAROON_PATH", "./certs/lit.macaroon"), "Path to lit.macaroon")
	flag.StringVar(&cfg.Network, "network", envOr("BITCOIN_NETWORK", "mainnet"), "Bitcoin network")
	flag.Parse()

	return cfg
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
