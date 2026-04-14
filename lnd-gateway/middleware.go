package main

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"log"
	"net/http"
	"time"

	"google.golang.org/grpc/metadata"
)

// extractMacaroon reads the agent macaroon from X-Macaroon header (base64).
func extractMacaroon(r *http.Request) string {
	return r.Header.Get("X-Macaroon")
}

// callWithMacaroon injects a per-call macaroon into gRPC context.
// If macaroonB64 is empty, returns ctx unchanged (admin macaroon from dial).
func callWithMacaroon(ctx context.Context, macaroonB64 string) context.Context {
	if macaroonB64 == "" {
		return ctx
	}

	macBytes, err := base64.StdEncoding.DecodeString(macaroonB64)
	if err != nil {
		return ctx
	}

	md := metadata.Pairs("macaroon", hex.EncodeToString(macBytes))
	return metadata.NewOutgoingContext(ctx, md)
}

// logging wraps a handler with request logging.
func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}
