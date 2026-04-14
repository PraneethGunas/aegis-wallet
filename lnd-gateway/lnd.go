package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/lightningnetwork/lnd/lnrpc/routerrpc"
	"github.com/lightningnetwork/lnd/lnrpc/walletrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

// LNDConn holds the gRPC connection and service clients.
type LNDConn struct {
	conn            *grpc.ClientConn
	Lightning       lnrpc.LightningClient
	Router          routerrpc.RouterClient
	WalletKit       walletrpc.WalletKitClient
	adminMacaroon   string // hex-encoded admin macaroon
}

// macaroonCredential implements grpc.PerRPCCredentials for admin macaroon.
type macaroonCredential struct {
	macaroon string // hex-encoded
}

func (m macaroonCredential) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	// If context already has a macaroon (per-call override), don't add admin
	md, ok := metadata.FromOutgoingContext(ctx)
	if ok {
		if macs := md.Get("macaroon"); len(macs) > 0 {
			return nil, nil // per-call macaroon takes precedence
		}
	}
	return map[string]string{"macaroon": m.macaroon}, nil
}

func (m macaroonCredential) RequireTransportSecurity() bool { return true }

// ConnectLND establishes a gRPC connection to LND.
func ConnectLND(cfg Config) (*LNDConn, error) {
	// Read TLS cert
	certBytes, err := os.ReadFile(cfg.TLSCertPath)
	if err != nil {
		return nil, fmt.Errorf("read TLS cert: %w", err)
	}

	certPool := x509.NewCertPool()
	if !certPool.AppendCertsFromPEM(certBytes) {
		return nil, fmt.Errorf("failed to parse TLS cert")
	}

	tlsCreds := credentials.NewTLS(&tls.Config{
		RootCAs: certPool,
	})

	// Read admin macaroon
	macPath := cfg.MacaroonPath
	if !filepath.IsAbs(macPath) {
		macPath, _ = filepath.Abs(macPath)
	}
	macBytes, err := os.ReadFile(macPath)
	if err != nil {
		return nil, fmt.Errorf("read macaroon: %w", err)
	}
	macHex := hex.EncodeToString(macBytes)

	// Dial LND
	conn, err := grpc.Dial(
		cfg.LNDSocket,
		grpc.WithTransportCredentials(tlsCreds),
		grpc.WithPerRPCCredentials(macaroonCredential{macaroon: macHex}),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(50*1024*1024)),
	)
	if err != nil {
		return nil, fmt.Errorf("dial LND: %w", err)
	}

	return &LNDConn{
		conn:          conn,
		Lightning:     lnrpc.NewLightningClient(conn),
		Router:        routerrpc.NewRouterClient(conn),
		WalletKit:     walletrpc.NewWalletKitClient(conn),
		adminMacaroon: macHex,
	}, nil
}

// Close shuts down the gRPC connection.
func (l *LNDConn) Close() error {
	return l.conn.Close()
}

// macaroonB64ToHex converts a base64 macaroon to hex (LND expects hex in metadata).
func macaroonB64ToHex(b64 string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}
