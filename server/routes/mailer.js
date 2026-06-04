// server/routes/mailer.js
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import db from '../db.js'
import { sendMail } from '../smtp.js'

const router = Router()

const ALLOWED_JOB_PATCH_FIELDS = new Set([
  'name', 'sender', 'sender_account_id', 'subject', 'body',
  'recipients', 'interval_minutes', 'use_index', 'attachments',
  'is_active', 'sort_order',
])

function auth(req, res, next) {
  if (req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

// GET /api/mailer/jobs
router.get('/jobs', auth, async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM mail_jobs ORDER BY sort_order ASC, created_at DESC')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/mailer/jobs
router.post('/jobs', auth, async (req, res) => {
  const { name, sender, sender_account_id, subject, body, recipients, interval_minutes, use_index, attachments } = req.body
  try {
    const { rows } = await db.query(
      `INSERT INTO mail_jobs (name, sender, sender_account_id, subject, body, recipients, interval_minutes, use_index, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, sender, sender_account_id || null, subject, body, recipients, interval_minutes, use_index ?? false, JSON.stringify(attachments ?? [])]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/mailer/jobs/:id
router.patch('/jobs/:id', auth, async (req, res) => {
  const { id } = req.params
  const fields = req.body
  const keys = Object.keys(fields).filter(k => ALLOWED_JOB_PATCH_FIELDS.has(k))
  if (keys.length === 0) return res.status(400).json({ error: 'no valid fields' })

  const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`)
  const values = keys.map(k => fields[k])

  try {
    const { rows } = await db.query(
      `UPDATE mail_jobs SET ${setClauses.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'not found' })
    res.json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/mailer/jobs/:id
router.delete('/jobs/:id', auth, async (req, res) => {
  const { id } = req.params
  try {
    const { rows } = await db.query('SELECT * FROM mail_jobs WHERE id = $1', [id])
    const job = rows[0]
    if (!job) return res.status(404).json({ error: 'not found' })
    if (job?.attachments?.length) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      await supabase.storage.from('attachments').remove(job.attachments.map(a => a.path))
    }
    await db.query('DELETE FROM mail_jobs WHERE id = $1', [id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/mailer/senders
router.get('/senders', auth, async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, created_at FROM sender_accounts ORDER BY created_at ASC')
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/mailer/senders
router.post('/senders', auth, async (req, res) => {
  const { email, app_password } = req.body
  try {
    const { rows } = await db.query(
      'INSERT INTO sender_accounts (email, app_password) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, app_password]
    )
    res.status(201).json(rows[0])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/mailer/senders/:id
router.delete('/senders/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM sender_accounts WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/mailer/tick — 스케줄러가 호출
router.post('/tick', async (_req, res) => {
  try {
    const now = Date.now()
    const { rows: jobs } = await db.query('SELECT * FROM mail_jobs WHERE is_active = true')
    const due = jobs.filter(job => {
      if (!job.last_sent_at) return true
      return now >= new Date(job.last_sent_at).getTime() + job.interval_minutes * 60_000
    })

    const results = await Promise.allSettled(
      due.map(async (job) => {
        const subject = job.use_index ? `[${job.send_count + 1}] ${job.subject}` : job.subject

        let sendOpts = { sender: job.sender }
        if (job.sender_account_id) {
          const { rows } = await db.query('SELECT * FROM sender_accounts WHERE id = $1', [job.sender_account_id])
          const account = rows[0]
          if (!account) throw new Error(`Sender account not found: ${job.sender_account_id}`)
          sendOpts = { senderEmail: account.email, senderPassword: account.app_password }
        }

        for (const recipient of job.recipients) {
          await sendMail({ ...sendOpts, to: recipient, subject, body: job.body, attachments: job.attachments })
        }

        await db.query(
          'UPDATE mail_jobs SET last_sent_at = NOW(), send_count = $1 WHERE id = $2',
          [job.send_count + 1, job.id]
        )
      })
    )

    const failed = results.filter(r => r.status === 'rejected').length
    res.json({ processed: due.length, failed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
