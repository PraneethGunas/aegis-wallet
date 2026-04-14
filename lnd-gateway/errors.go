package main

import (
	"encoding/json"
	"net/http"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	GRPCCode int    `json:"grpc_code,omitempty"`
}

var grpcCodeMap = map[codes.Code]string{
	codes.NotFound:            "NOT_FOUND",
	codes.AlreadyExists:       "ALREADY_EXISTS",
	codes.FailedPrecondition:  "INSUFFICIENT_BALANCE",
	codes.DeadlineExceeded:    "PAYMENT_TIMEOUT",
	codes.Unavailable:         "LND_UNAVAILABLE",
	codes.Unauthenticated:     "INVALID_MACAROON",
	codes.PermissionDenied:    "PERMISSION_DENIED",
	codes.InvalidArgument:     "INVALID_ARGUMENT",
	codes.Unknown:             "UNKNOWN",
}

func writeError(w http.ResponseWriter, httpCode int, code string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpCode)
	json.NewEncoder(w).Encode(ErrorResponse{
		Error: ErrorDetail{Code: code, Message: message},
	})
}

func writeGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	if !ok {
		writeError(w, 500, "INTERNAL", err.Error())
		return
	}

	code, exists := grpcCodeMap[st.Code()]
	if !exists {
		code = "UNKNOWN"
	}

	httpCode := grpcToHTTP(st.Code())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpCode)
	json.NewEncoder(w).Encode(ErrorResponse{
		Error: ErrorDetail{
			Code:     code,
			Message:  st.Message(),
			GRPCCode: int(st.Code()),
		},
	})
}

func grpcToHTTP(c codes.Code) int {
	switch c {
	case codes.NotFound:
		return 404
	case codes.AlreadyExists:
		return 409
	case codes.FailedPrecondition:
		return 400
	case codes.DeadlineExceeded:
		return 504
	case codes.Unavailable:
		return 503
	case codes.Unauthenticated, codes.PermissionDenied:
		return 401
	case codes.InvalidArgument:
		return 400
	default:
		return 500
	}
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
