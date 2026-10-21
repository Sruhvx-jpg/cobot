package orm

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
)

type whereClause struct {
	expr string
	args []any
}

// SelectBuilder constructs and executes SELECT queries.
type SelectBuilder struct {
	executor Executor
	table    string
	columns  []string
	wheres   []whereClause
	orderBys []string
	limit    int
	offset   int
	err      error
}

// NewSelect creates a new SelectBuilder.
func NewSelect(executor Executor) *SelectBuilder {
	return &SelectBuilder{executor: executor}
}

// Model infers table name and columns from the given model struct.
func (b *SelectBuilder) Model(model any) *SelectBuilder {
	meta, err := GetModelMetadata(model)
	if err != nil {
		b.err = err
		return b
	}
	b.table = meta.TableName
	if len(b.columns) == 0 {
		b.columns = meta.Columns
	}
	return b
}

// From sets the target table name.
func (b *SelectBuilder) From(table string) *SelectBuilder {
	b.table = table
	return b
}

// Columns sets the projected columns.
func (b *SelectBuilder) Columns(cols ...string) *SelectBuilder {
	b.columns = cols
	return b
}

// Where appends a WHERE filter clause. '?' placeholders are automatically translated to '$1, $2, ...'.
func (b *SelectBuilder) Where(expr string, args ...any) *SelectBuilder {
	b.wheres = append(b.wheres, whereClause{expr: expr, args: args})
	return b
}

// OrderBy appends ORDER BY clauses.
func (b *SelectBuilder) OrderBy(orders ...string) *SelectBuilder {
	b.orderBys = append(b.orderBys, orders...)
	return b
}

// Limit sets the query LIMIT.
func (b *SelectBuilder) Limit(limit int) *SelectBuilder {
	b.limit = limit
	return b
}

// Offset sets the query OFFSET.
func (b *SelectBuilder) Offset(offset int) *SelectBuilder {
	b.offset = offset
	return b
}

// ToSQL generates the ChaiSQL SELECT string and positional arguments.
func (b *SelectBuilder) ToSQL() (string, []any, error) {
	if b.err != nil {
		return "", nil, b.err
	}
	if b.table == "" {
		return "", nil, fmt.Errorf("no table specified for SELECT")
	}

	var sb strings.Builder
	cols := "*"
	if len(b.columns) > 0 {
		cols = strings.Join(b.columns, ", ")
	}

	sb.WriteString(fmt.Sprintf("SELECT %s FROM %s", cols, b.table))

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

	if len(b.orderBys) > 0 {
		sb.WriteString(" ORDER BY " + strings.Join(b.orderBys, ", "))
	}

	if b.limit > 0 {
		sb.WriteString(fmt.Sprintf(" LIMIT %d", b.limit))
	}

	if b.offset > 0 {
		sb.WriteString(fmt.Sprintf(" OFFSET %d", b.offset))
	}

	return sb.String(), allArgs, nil
}

// Query executes the SELECT query and returns the raw *sql.Rows.
func (b *SelectBuilder) Query(ctx context.Context) (*sql.Rows, error) {
	query, args, err := b.ToSQL()
	if err != nil {
		return nil, err
	}
	return b.executor.QueryContext(ctx, query, args...)
}

// Find executes the query and scans all matching rows into a slice pointer.
func (b *SelectBuilder) Find(ctx context.Context, dest any) error {
	destVal := reflect.ValueOf(dest)
	if destVal.Kind() != reflect.Pointer || destVal.Elem().Kind() != reflect.Slice {
		return fmt.Errorf("dest must be a pointer to a slice, got %T", dest)
	}

	sliceVal := destVal.Elem()
	elemType := sliceVal.Type().Elem()
	isPtr := elemType.Kind() == reflect.Pointer
	if isPtr {
		elemType = elemType.Elem()
	}

	if b.table == "" {
		b.Model(reflect.New(elemType).Interface())
	}

	rows, err := b.Query(ctx)
	if err != nil {
		return err
	}
	defer rows.Close()

	colNames, err := rows.Columns()
	if err != nil {
		return err
	}

	meta, err := getMetadataForType(elemType)
	if err != nil {
		return err
	}

	// Prepare field indices corresponding to returned column headers
	fieldIndices := make([]int, len(colNames))
	for i, col := range colNames {
		idx, ok := meta.FieldMap[col]
		if !ok {
			fieldIndices[i] = -1
		} else {
			fieldIndices[i] = idx
		}
	}

	for rows.Next() {
		newElem := reflect.New(elemType).Elem()
		scans := make([]any, len(colNames))
		for i, fieldIdx := range fieldIndices {
			if fieldIdx >= 0 {
				scans[i] = newElem.Field(fieldIdx).Addr().Interface()
			} else {
				var dummy any
				scans[i] = &dummy
			}
		}

		if err := rows.Scan(scans...); err != nil {
			return err
		}

		if isPtr {
			sliceVal.Set(reflect.Append(sliceVal, newElem.Addr()))
		} else {
			sliceVal.Set(reflect.Append(sliceVal, newElem))
		}
	}

	return rows.Err()
}

// First executes the query, limits to 1 row, and scans the result into a struct pointer.
// Returns sql.ErrNoRows if no record matches.
func (b *SelectBuilder) First(ctx context.Context, dest any) error {
	destVal := reflect.ValueOf(dest)
	if destVal.Kind() != reflect.Pointer || destVal.Elem().Kind() != reflect.Struct {
		return fmt.Errorf("dest must be a pointer to a struct, got %T", dest)
	}

	elemVal := destVal.Elem()
	elemType := elemVal.Type()

	if b.table == "" {
		b.Model(dest)
	}
	b.Limit(1)

	rows, err := b.Query(ctx)
	if err != nil {
		return err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return err
		}
		return sql.ErrNoRows
	}

	colNames, err := rows.Columns()
	if err != nil {
		return err
	}

	meta, err := getMetadataForType(elemType)
	if err != nil {
		return err
	}

	scans := make([]any, len(colNames))
	for i, col := range colNames {
		if idx, ok := meta.FieldMap[col]; ok {
			scans[i] = elemVal.Field(idx).Addr().Interface()
		} else {
			var dummy any
			scans[i] = &dummy
		}
	}

	return rows.Scan(scans...)
}
