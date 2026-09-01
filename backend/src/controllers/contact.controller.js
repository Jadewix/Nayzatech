/**
 * Contact form endpoints.
 *
 * Public submission plus an admin inbox. The submission is saved to the
 * database FIRST and emailed second — if Brevo is down, the message is still
 * safely stored and you can read it in the admin panel. A contact form that
 * only sends email loses messages whenever the mail provider hiccups.
 */

import { supabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess, buildPagination } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendContactAlert } from '../services/email.service.js';

/**
 * POST /api/contact    (public)
 *
 * Body: { name, email, subject?, message, website? }
 *
 * `website` is a honeypot — render it hidden in React and a bot will fill it
 * in while a human never sees it. The zod schema rejects any non-empty value,
 * so spam is blocked with no captcha and no friction for real customers.
 */
export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  const { data: submission, error } = await supabase
    .from('contact_submissions')
    .insert({
      name,
      email,
      subject: subject || null,
      message,
      // Kept for abuse tracing. req.ip is only trustworthy because app.js sets
      // `trust proxy` for the hosting platform's forwarding headers.
      ip_address: req.ip,
      user_agent: req.get('user-agent')?.slice(0, 500) || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Saved. The alert email is a side effect — never let it fail the request,
  // or a customer would resubmit and you would get duplicates.
  const emailResult = await sendContactAlert(submission).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[CONTACT] Admin alert failed:', err.message);
    return { sent: false, error: err.message };
  });

  return sendSuccess(
    res,
    {
      id: submission.id,
      created_at: submission.created_at,
      message: 'Thanks for getting in touch. We will reply shortly.',
      admin_notified: emailResult?.sent === true,
    },
    { status: 201 }
  );
});

/**
 * GET /api/admin/contact    (admin)
 * The inbox. Filter with ?is_read=false to see only what needs answering.
 */
export const listContacts = asyncHandler(async (req, res) => {
  const { page, limit, is_read: isRead, search } = req.query;

  let query = supabase
    .from('contact_submissions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (isRead !== undefined) query = query.eq('is_read', isRead);

  if (search) {
    const term = search.replace(/[%,()]/g, ' ').trim();
    if (term) {
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,subject.ilike.%${term}%`);
    }
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const { count: unreadCount } = await supabase
    .from('contact_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  return sendSuccess(res, data, {
    meta: {
      ...buildPagination({ total: count ?? 0, page, limit }),
      unread_count: unreadCount || 0,
    },
  });
});

/**
 * GET /api/admin/contact/:id    (admin)
 * Reading a message marks it read, which is what you would expect from an inbox.
 */
export const getContact = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: submission, error } = await supabase
    .from('contact_submissions').select('*').eq('id', id).maybeSingle();

  if (error) throw error;
  if (!submission) throw ApiError.notFound('Message not found', 'CONTACT_NOT_FOUND');

  if (!submission.is_read) {
    await supabase.from('contact_submissions').update({ is_read: true }).eq('id', id);
    submission.is_read = true;
  }

  return sendSuccess(res, submission);
});

/**
 * PATCH /api/admin/contact/:id/read    (admin)
 * Body: { "is_read": true }   — toggle so you can mark something unread again.
 */
export const markContactRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isRead = req.body.is_read !== false;

  const { data, error } = await supabase
    .from('contact_submissions').update({ is_read: isRead }).eq('id', id)
    .select('id, is_read').maybeSingle();

  if (error) throw error;
  if (!data) throw ApiError.notFound('Message not found', 'CONTACT_NOT_FOUND');

  return sendSuccess(res, data);
});

/**
 * DELETE /api/admin/contact/:id    (admin)
 */
export const deleteContact = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from('contact_submissions').delete().eq('id', id);
  if (error) throw error;

  return sendSuccess(res, { id, deleted: true });
});

export default { submitContact, listContacts, getContact, markContactRead, deleteContact };
