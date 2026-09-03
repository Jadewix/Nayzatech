/**
 * Everything the panel knows about the cash-on-delivery lifecycle.
 *
 *   pending ──> confirmed ──> processing ──> shipped ──> delivered
 *      │            │              │            │
 *      │            │              │            └──> failed_delivery
 *      └────────────┴──────────────┴──> cancelled
 *
 * THE DATABASE IS THE AUTHORITY, NOT THIS FILE.
 *
 * set_order_status() rejects an illegal move with a 409 that names the
 * transitions it would have accepted. This table only decides which buttons to
 * *offer* — it never decides whether a move is allowed. If the two ever drift,
 * the server wins and the UI shows its message. That is why the buttons are
 * generated from here but the failure text comes from the API.
 */

export const STATUS_FLOW = {
  pending:         ['confirmed', 'cancelled'],
  confirmed:       ['processing', 'cancelled'],
  processing:      ['shipped', 'cancelled'],
  shipped:         ['delivered', 'failed_delivery', 'cancelled'],
  delivered:       [],
  cancelled:       [],
  failed_delivery: [],
};

export const STATUS_LABELS = {
  pending:         'Awaiting call',
  confirmed:       'Confirmed',
  processing:      'Packing',
  shipped:         'Out for delivery',
  delivered:       'Delivered',
  cancelled:       'Cancelled',
  failed_delivery: 'Delivery failed',
};

/** What each button actually does, in the operator's words rather than the enum's. */
export const ACTION_LABELS = {
  confirmed:       'Confirm by phone',
  processing:      'Start packing',
  shipped:         'Hand to courier',
  delivered:       'Delivered, cash collected',
  failed_delivery: 'Give up on delivery',
  cancelled:       'Cancel order',
};

/** Longer explanation, shown under the buttons so nobody clicks the wrong one. */
export const ACTION_HINTS = {
  confirmed:       'You spoke to the customer and the order is real.',
  processing:      'Being picked and packed.',
  shipped:         'The courier has it and is carrying the cash payment.',
  delivered:       'The courier handed it over and collected the money. This is what revenue counts.',
  failed_delivery: 'Stop trying. Final — the order cannot be reopened.',
  cancelled:       'Called off. Final — the order cannot be reopened.',
};

/** Tailwind classes per status. Terminal-but-bad states share the alert palette. */
export const STATUS_STYLES = {
  pending:         'bg-accent-dim text-accent',
  confirmed:       'bg-accent-dim text-accent',
  processing:      'bg-surface text-ink',
  shipped:         'bg-surface text-ink',
  delivered:       'bg-cash-dim text-cash',
  cancelled:       'bg-alert-dim text-alert',
  failed_delivery: 'bg-alert-dim text-alert',
};

export const ALL_STATUSES = Object.keys(STATUS_FLOW);

/** The three that cannot be changed again. */
export function isTerminal(status) {
  return STATUS_FLOW[status]?.length === 0;
}

export function StatusPill({ status, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-2 py-1 font-mono text-[0.65rem] font-semibold tracking-[0.1em] uppercase ${
        STATUS_STYLES[status] || 'bg-surface text-muted'
      } ${className}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
