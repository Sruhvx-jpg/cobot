package orm

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

type setPair struct {
	column string
	value  any
}

// UpdateBuilder constructs and executes UPDATE statements.
type UpdateBuilder struct {
	executor Executor
	table    string
	sets     []setPair
	wheres   []whereClause
	err      error
}

// NewUpdate creates a new UpdateBuilder.
func NewUpdate(executor Executor) *UpdateBuilder {
	return &UpdateBuilder{executor: executor}
}

// Table sets the target table name.
func (b *UpdateBuilder) Table(table string) *UpdateBuilder {
	b.table = table
	return b
}

// Model infers table name from model struct.
func (b *UpdateBuilder) Model(model any) *UpdateBuilder {
	meta, err := GetModelMetadata(model)
	if err != nil {
		b.err = err
		return b
	}
	b.table = meta.TableName
	return b
}

// Set adds a column = value assignment.
func (b *UpdateBuilder) Set(column string, value any) *UpdateBuilder {
	b.sets = append(b.sets, setPair{column: column, value: value})
	return b
}

// Where appends a WHERE filter clause.
func (b *UpdateBuilder) Where(expr string, args ...any) *UpdateBuilder {
	b.wheres = append(b.wheres, whereClause{expr: expr, args: args})
	return b
}

// ToSQL generates the ChaiSQL UPDATE statement and positional parameters.
func (b *UpdateBuilder) ToSQL() (string, []any, error) {
	if b.err != nil {
		return "", nil, b.err
	}
	if b.table == "" {
		return "", nil, fmt.Errorf("no table specified for UPDATE")
	}
	if len(b.sets) == 0 {
		return "", nil, fmt.Errorf("no SET clauses specified for UPDATE")
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("UPDATE %s SET ", b.table))

	var allArgs []any
	argCount := 1

	var setStrs []string
	for _, s := range b.sets {
		setStrs = append(setStrs, fmt.Sprintf("%s = $%d", s.column, argCount))
		argCount++
		allArgs = append(allArgs, s.value)
	}
	sb.WriteString(strings.Join(setStrs, ", "))

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

// Exec executes the UPDATE statement.
func (b *UpdateBuilder) Exec(ctx context.Context) (sql.Result, error) {
	query, args, err := b.ToSQL()
	if err != nil {
		return nil, err
	}
	return b.executor.ExecContext(ctx, query, args...)
}
