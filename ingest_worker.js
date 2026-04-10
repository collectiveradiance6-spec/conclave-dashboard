
require('dotenv').config();
const { supabase } = require('./knowledge_db');
const { storeCitation } = require('./lib/citations');
const { fetchRssSource } = require('./sources/rss');
const { fetchJsonFeedSource } = require('./sources/jsonfeed');
const { fetchRedditJsonSource } = require('./sources/reddit_json');

const INTERVAL_MINUTES = Number(process.env.INGEST_INTERVAL_MINUTES || 15);

async function getAllowlist() {
  const { data, error } = await supabase.from('source_allowlist').select('*').eq('is_enabled', true).order('priority', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function insertCandidate(candidate) {
  const { data: existing } = await supabase.from('source_candidates').select('id').eq('content_hash', candidate.content_hash).maybeSingle();
  if (existing?.id) return { id: existing.id, inserted: false };
  const { data, error } = await supabase.from('source_candidates').insert(candidate).select('id').single();
  if (error) throw error;
  await storeCitation(supabase, data.id, candidate);
  return { id: data.id, inserted: true };
}

async function fetchByType(row) {
  if (row.source_type === 'rss') return fetchRssSource(row);
  if (row.source_type === 'jsonfeed') return fetchJsonFeedSource(row);
  if (row.source_type === 'reddit_json') return fetchRedditJsonSource(row);
  return [];
}

async function runSource(row) {
  const { data: runRow, error: runErr } = await supabase.from('ingestion_runs').insert({ source_key: row.source_key, status: 'running' }).select().single();
  if (runErr) throw runErr;
  const runId = runRow.id;
  let seen = 0, inserted = 0;
  try {
    const candidates = await fetchByType(row);
    seen = candidates.length;
    for (const candidate of candidates) {
      const result = await insertCandidate(candidate);
      if (result.inserted) inserted += 1;
    }
    await supabase.from('ingestion_runs').update({ status: 'success', finished_at: new Date().toISOString(), items_seen: seen, items_new: inserted, summary: `Processed ${seen}, inserted ${inserted}` }).eq('id', runId);
    console.log(`✅ ${row.source_key}: processed ${seen}, inserted ${inserted}`);
  } catch (e) {
    await supabase.from('ingestion_runs').update({ status: 'error', finished_at: new Date().toISOString(), items_seen: seen, items_new: inserted, summary: e.message }).eq('id', runId);
    console.error(`❌ ${row.source_key}:`, e.message);
  }
}

async function runOnce() {
  const rows = await getAllowlist();
  for (const row of rows) {
    await runSource(row);
  }
}

async function main() {
  await runOnce();
  if (process.env.RUN_INGEST_WORKER === 'true') {
    setInterval(runOnce, INTERVAL_MINUTES * 60 * 1000);
    console.log(`🛰️ Ingestion worker running every ${INTERVAL_MINUTES} minutes`);
  }
}

main().catch((e) => {
  console.error('❌ Worker failed:', e);
  process.exit(1);
});
