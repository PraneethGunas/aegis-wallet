FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /lnd-gateway .

FROM alpine:3.21
COPY --from=builder /lnd-gateway /usr/local/bin/
ENTRYPOINT ["lnd-gateway"]
