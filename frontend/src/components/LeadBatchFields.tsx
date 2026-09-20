import { Plus, X } from '../icons';
import { currentLeadForm, LeadFormFields, type LeadFormData } from './LeadFormFields';

export type LeadBatchRow = { key: number; form: LeadFormData };

let nextRowKey = 1;

export function createLeadBatchRow(form = currentLeadForm()): LeadBatchRow {
  return { key: nextRowKey++, form };
}

export function LeadBatchFields({
  rows,
  onChange,
  allowBackdated = true,
  afterContact
}: {
  rows: LeadBatchRow[];
  onChange: (rows: LeadBatchRow[]) => void;
  allowBackdated?: boolean;
  afterContact?: (row: LeadBatchRow) => React.ReactNode;
}) {
  const update = (key: number, field: keyof LeadFormData, value: string) =>
    onChange(rows.map(row => row.key === key ? { ...row, form: { ...row.form, [field]: value } } : row));

  const addAfter = (row: LeadBatchRow) => {
    const next = currentLeadForm(row.form.leadSource);
    next.leadType = row.form.leadType;
    next.referenceName = row.form.referenceName;
    const index = rows.findIndex(item => item.key === row.key);
    const updated = [...rows];
    updated.splice(index + 1, 0, createLeadBatchRow(next));
    onChange(updated);
  };

  const remove = (key: number) => onChange(rows.filter(row => row.key !== key));

  return <div className="lead-batch-fields">
    {rows.map((row, index) => <section className="lead-batch-entry" key={row.key}>
      {rows.length > 1 && <div className="lead-batch-entry-head"><div><b>{index + 1}</b><span><strong>Lead {index + 1}</strong><small>Customer enquiry details</small></span></div>{index > 0 && <button type="button" className="icon-button" onClick={() => remove(row.key)} aria-label={`Remove lead ${index + 1}`}><X /></button>}</div>}
      <LeadFormFields
        form={row.form}
        set={(field, value) => update(row.key, field, value)}
        allowBackdated={allowBackdated}
        afterContact={afterContact?.(row)}
        afterAddress={rows.length < 20
          ? <button type="button" className="add-more-lead" onClick={() => addAfter(row)}><Plus />Add more lead</button>
          : <small className="muted">Maximum 20 leads can be added at once.</small>}
      />
    </section>)}
  </div>;
}
