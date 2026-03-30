FROM golang:1.23 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ratelimitd ./cmd/ratelimitd

FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=builder /app/ratelimitd /app/ratelimitd
COPY --from=builder /app/configs /app/configs
EXPOSE 8080 9090
ENTRYPOINT ["/app/ratelimitd"]
