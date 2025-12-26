# Build k6 with xk6-sse extension
FROM golang:1.23-alpine AS builder

# Install xk6 v0.11.0 (compatible with Go 1.23)
RUN go install go.k6.io/xk6/cmd/xk6@v0.11.0

# Build k6 with xk6-sse extension
RUN xk6 build \
    --with github.com/phymbert/xk6-sse@latest \
    --output /k6

# Runtime image
FROM alpine:3.19

# Install dependencies
RUN apk add --no-cache ca-certificates

# Copy k6 binary
COPY --from=builder /k6 /usr/bin/k6

# Create working directory
WORKDIR /scripts

# Set entrypoint
ENTRYPOINT ["k6"]
