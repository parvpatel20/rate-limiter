package logging

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

type contextKey string

const (
	tenantIDKey contextKey = "tenant_id"
	traceIDKey  contextKey = "trace_id"
	routeKey    contextKey = "route"
)

func NewLogger(appEnv string) *slog.Logger {
	if strings.EqualFold(appEnv, "production") {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}

func WithRequestValues(ctx context.Context, tenantID, traceID, route string) context.Context {
	ctx = context.WithValue(ctx, tenantIDKey, tenantID)
	ctx = context.WithValue(ctx, traceIDKey, traceID)
	ctx = context.WithValue(ctx, routeKey, route)
	return ctx
}

func RequestAttrs(ctx context.Context) []any {
	attrs := make([]any, 0, 6)
	if tenantID, _ := ctx.Value(tenantIDKey).(string); tenantID != "" {
		attrs = append(attrs, "tenant_id", tenantID)
	}
	if traceID, _ := ctx.Value(traceIDKey).(string); traceID != "" {
		attrs = append(attrs, "trace_id", traceID)
	}
	if route, _ := ctx.Value(routeKey).(string); route != "" {
		attrs = append(attrs, "route", route)
	}
	return attrs
}
