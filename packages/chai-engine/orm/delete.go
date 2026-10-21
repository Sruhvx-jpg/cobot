package orm

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// DeleteBuilder constructs and executes DELETE statements.
type DeleteBuilder struct {
	executor Executor
	table    string
	wheres   []whereClause
	err      error
}

// NewDelete creates a new DeleteBuilder.
func NewDelete(executor Executor) *DeleteBuilder {
	return &DeleteBuilder{executor: executor}
}

// From sets the target table name.
func (b *DeleteBuilder) From(table string) *DeleteBuilder {
	b.table = table
	return b
}

// Model infers the table name from a model struct.
func (b *DeleteBuilder) Model(model any) *DeleteBuilder {
	meta, err := GetModelMetadata(model)
	if err != nil {
		b.err = err
		return b
	}
	b.table = meta.TableName
	return b
}

// Where appends a WHERE filter clause.
func (b *DeleteBuilder) Where(expr string, args ...any) *DeleteBuilder {
	b.wheres = append(b.wheres, whereClause{expr: expr, args: args})
	return b
}

// ToSQL generates the ChaiSQL DELETE statement and positional parameters.
func (b *DeleteBuilder) ToSQL() (string, []any, error) {
	if b.err != nil {
		return "", nil, b.err
	}
	if b.table == "" {
		return "", nil, fmt.Errorf("no table specified for DELETE")
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("DELETE FROM %s", b.table))

	var allArgs []any
	if len(b.wheres) > 0 {
		var whereParts []string
		for _, w := range b.wheres {
			converted := ConvertPlaceholders(w.expr, len(allArgs)+1)
			whereParts = append(whereParts, "("+converted+")")
			allArgs = append(allArgs, w.args...)
		}
		sb.WriteString(" WHERE " + strings.Join(whereParts, " AND "))
	}

	return sb.String(), allArgs, nil
}

// Exec executes the DELETE statement.
func (b *DeleteBuilder) Exec(ctx context.Context) (sql.Result, error) {
	query, args, err := b.ToSQL()
	if err != nil {
		return nil, err
	}
	return b.executor.ExecContext(ctx, query, args...)
}
