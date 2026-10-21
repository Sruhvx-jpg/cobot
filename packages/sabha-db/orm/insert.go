package orm

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
)

// InsertBuilder constructs and executes INSERT statements.
type InsertBuilder struct {
	executor Executor
	table    string
	columns  []string
	records  [][]any
	err      error
}

// NewInsert creates a new InsertBuilder.
func NewInsert(executor Executor) *InsertBuilder {
	return &InsertBuilder{executor: executor}
}

// Into overrides the target table name.
func (b *InsertBuilder) Into(table string) *InsertBuilder {
	b.table = table
	return b
}

// Model populates table name, columns, and values from a struct pointer or slice of structs.
func (b *InsertBuilder) Model(model any) *InsertBuilder {
	meta, err := GetModelMetadata(model)
	if err != nil {
		b.err = err
		return b
	}
	if b.table == "" {
		b.table = meta.TableName
	}
	b.columns = meta.Columns

	val := reflect.ValueOf(model)
	for val.Kind() == reflect.Pointer || val.Kind() == reflect.Interface {
		val = val.Elem()
	}

	if val.Kind() == reflect.Slice {
		for i := 0; i < val.Len(); i++ {
			elem := val.Index(i)
			for elem.Kind() == reflect.Pointer || elem.Kind() == reflect.Interface {
				elem = elem.Elem()
			}
			rowVals := extractRowValues(elem, meta)
			b.records = append(b.records, rowVals)
		}
	} else if val.Kind() == reflect.Struct {
		rowVals := extractRowValues(val, meta)
		b.records = append(b.records, rowVals)
	} else {
		b.err = fmt.Errorf("unsupported model kind %s for Insert", val.Kind())
	}

	return b
}

func extractRowValues(structVal reflect.Value, meta *ModelMetadata) []any {
	vals := make([]any, len(meta.Columns))
	for i, col := range meta.Columns {
		fieldIdx := meta.FieldMap[col]
		fieldVal := structVal.Field(fieldIdx)
		vals[i] = fieldVal.Interface()
	}
	return vals
}

// ToSQL generates the ChaiSQL INSERT statement and positional parameters.
func (b *InsertBuilder) ToSQL() (string, []any, error) {
	if b.err != nil {
		return "", nil, b.err
	}
	if b.table == "" {
		return "", nil, fmt.Errorf("no table specified for INSERT")
	}
	if len(b.columns) == 0 || len(b.records) == 0 {
		return "", nil, fmt.Errorf("no columns or records specified for INSERT")
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s (%s) VALUES ", b.table, strings.Join(b.columns, ", ")))

	var allArgs []any
	argCount := 1

	for rIdx, record := range b.records {
		if rIdx > 0 {
			sb.WriteString(", ")
		}
		sb.WriteString("(")
		for cIdx, val := range record {
			if cIdx > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString(fmt.Sprintf("$%d", argCount))
			argCount++
			allArgs = append(allArgs, val)
		}
		sb.WriteString(")")
	}

	return sb.String(), allArgs, nil
}

// Exec executes the INSERT statement.
func (b *InsertBuilder) Exec(ctx context.Context) (sql.Result, error) {
	query, args, err := b.ToSQL()
	if err != nil {
		return nil, err
	}
	return b.executor.ExecContext(ctx, query, args...)
}
