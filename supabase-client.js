/* ═══════════════════════════════════════════════════════════════
   MentorHub · Google Sheets 데이터 레이어 v2
   ─────────────────────────────────────────────────────────────
   ✅ 실제 연결된 Google Sheets 3개 파일 사용
   notices     : 1NU7fUnS_RSMPEDKfqqWm_bIx19bq7rtXZocFQLxeFps
   assignments : 1WzQs0S_fvVfAQwo6SM3xv7d9XdtHhUSyxNzFjoMKESw
   users       : 1OlQEL_Y5PssVihz0lUshQL90cnHp_GI1OOytq-Vl_6w
════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   ① 설정 — 시트 ID & Apps Script URL
───────────────────────────────────────── */
const SHEET_IDS = {
  notices:     '1NU7fUnS_RSMPEDKfqqWm_bIx19bq7rtXZocFQLxeFps',
  assignments: '1WzQs0S_fvVfAQwo6SM3xv7d9XdtHhUSyxNzFjoMKESw',
  users:       '1OlQEL_Y5PssVihz0lUshQL90cnHp_GI1OOytq-Vl_6w',
};

// 읽기+쓰기가 필요하면 Apps Script 배포 URL을 입력하세요.
// 비워두면 CSV 읽기 전용 모드(공지·과제 조회만 가능)로 동작합니다.
const APPS_SCRIPT_URL = '';

/* ─────────────────────────────────────────
   ② 모드: A = Apps Script, B = CSV 읽기전용
───────────────────────────────────────── */
const MODE = APPS_SCRIPT_URL ? 'A' : 'B';
console.info(`[MentorHub] Google Sheets 모드: ${MODE === 'A' ? 'Apps Script (읽기+쓰기)' : 'CSV 읽기 전용'}`);

/* ─────────────────────────────────────────
   ③ Auth  (sessionStorage 기반 간이 인증)
      users 시트에서 email/password 대조
───────────────────────────────────────── */
const SESSION_KEY = 'mentorHub_gs_session';

export const Auth = {

  async signIn(email, password) {
    const rows = await _csv('users');
    const u    = rows.find(r =>
      r.email?.trim().toLowerCase() === email.trim().toLowerCase() &&
      r.password?.trim()            === password
    );
    if (!u) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    const sess = _mkSession(u);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    return { user: sess.user, session: sess };
  },

  async signUp(email, password, opts = {}) {
    if (MODE === 'B') throw new Error('읽기 전용 모드 — 회원가입은 Apps Script URL 설정 후 사용 가능합니다.');
    const rows = await _csv('users');
    if (rows.find(r => r.email?.toLowerCase() === email.toLowerCase()))
      throw new Error('이미 등록된 이메일입니다.');
    const nu = {
      id: _uuid(), email, password,
      display_name: opts.data?.display_name || email.split('@')[0],
      role:         opts.data?.role         || 'mentee',
      created_at:   _now(),
    };
    await _write('users', { action:'append', row: nu });
    return { user: nu };
  },

  async signOut() { sessionStorage.removeItem(SESSION_KEY); },

  async getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.expires_at && Date.now() > s.expires_at) {
      sessionStorage.removeItem(SESSION_KEY); return null;
    }
    return s;
  },

  async getUser() {
    const s = await Auth.getSession();
    return s?.user ?? null;
  },

  onAuthStateChange(cb) {
    let prev = sessionStorage.getItem(SESSION_KEY);
    const t  = setInterval(() => {
      const cur = sessionStorage.getItem(SESSION_KEY);
      if (cur === prev) return;
      prev = cur;
      cb(cur ? 'SIGNED_IN' : 'SIGNED_OUT', cur ? JSON.parse(cur) : null);
    }, 800);
    return () => clearInterval(t);
  },

  isMentor(user) {
    return user?.user_metadata?.role === 'mentor';
  },
};

/* ─────────────────────────────────────────
   ④ Notices  (notices 시트)
   헤더: id, title, content, author_id,
         author_name, author_role, is_pinned, created_at
───────────────────────────────────────── */
export const Notices = {

  async fetchAll(limit = 30) {
    const rows = await _csv('notices');
    return rows
      .filter(r => r.id && r.title)
      .map(r => ({
        id:         r.id,
        title:      r.title,
        content:    r.content     || '',
        author_id:  r.author_id   || '',
        is_pinned:  r.is_pinned?.toUpperCase() === 'TRUE',
        created_at: r.created_at  || _now(),
        profiles:   { display_name: r.author_name || '—', role: r.author_role || 'mentor' },
      }))
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, limit);
  },

  async create({ title, content, is_pinned = false }) {
    if (MODE === 'B') throw new Error('읽기 전용 모드입니다. Apps Script URL을 설정해 주세요.');
    const sess = await Auth.getSession();
    const row  = {
      id:          _uuid(),
      title,
      content,
      author_id:   sess?.user?.id                             ?? 'unknown',
      author_name: sess?.user?.user_metadata?.display_name   ?? '—',
      author_role: sess?.user?.user_metadata?.role            ?? 'mentor',
      is_pinned:   String(is_pinned).toUpperCase(),
      created_at:  _now(),
    };
    await _write('notices', { action:'append', row });
    return row;
  },

  async update(id, fields) {
    if (MODE === 'B') throw new Error('읽기 전용 모드입니다.');
    await _write('notices', { action:'update', id, fields });
    return { id, ...fields };
  },

  async remove(id) {
    if (MODE === 'B') throw new Error('읽기 전용 모드입니다.');
    await _write('notices', { action:'delete', id });
  },
};

/* ─────────────────────────────────────────
   ⑤ Assignments  (assignments 시트)
   헤더: id, title, description, due_date,
         status, mentee_id, mentee_name, feedback, created_at
───────────────────────────────────────── */
export const Assignments = {

  async fetchMine() {
    const sess = await Auth.getSession();
    const rows = await _csv('assignments');
    return _parseRows(rows).filter(t =>
      t.mentee_id === (sess?.user?.id ?? 'guest') || t.mentee_id === 'all'
    );
  },

  async fetchAll() {
    const rows = await _csv('assignments');
    return _parseRows(rows);
  },

  async updateStatus(id, status) {
    if (MODE === 'A') await _write('assignments', { action:'update', id, fields:{ status } });
    return { id, status };
  },

  async saveFeedback(id, feedback) {
    if (MODE === 'B') throw new Error('읽기 전용 모드입니다.');
    await _write('assignments', { action:'update', id, fields:{ feedback } });
    return { id, feedback };
  },

  async create(payload) {
    if (MODE === 'B') throw new Error('읽기 전용 모드입니다.');
    const row = {
      id:          _uuid(),
      title:       payload.title       || '',
      description: payload.description || '',
      due_date:    payload.due_date    || '',
      status:      payload.status      || 'todo',
      mentee_id:   payload.mentee_id   || 'all',
      mentee_name: payload.mentee_name || '',
      feedback:    '',
      created_at:  _now(),
    };
    await _write('assignments', { action:'append', row });
    return row;
  },
};

/* ─────────────────────────────────────────
   ⑥ Realtime  (30초 폴링)
───────────────────────────────────────── */
export const Realtime = {

  notices(cb) {
    let last = -1;
    const t = setInterval(async () => {
      try {
        const rows = await _csv('notices');
        if (last < 0) { last = rows.length; return; }
        if (rows.length > last) {
          rows.slice(last).forEach(r => cb('INSERT', r, null));
          last = rows.length;
        }
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  },

  assignments(menteeId, cb) {
    let hash = '';
    const t = setInterval(async () => {
      try {
        const rows  = await _csv('assignments');
        const mine  = rows.filter(r => r.mentee_id === menteeId || r.mentee_id === 'all');
        const newH  = JSON.stringify(mine.map(r => r.status + r.feedback));
        if (!hash) { hash = newH; return; }
        if (newH !== hash) { mine.forEach(r => cb('UPDATE', r, null)); hash = newH; }
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  },
};

/* ─────────────────────────────────────────
   ⑦ Utils
───────────────────────────────────────── */
export const Utils = {
  timeAgo(iso) {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1)  return '방금 전';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d}일 전`;
    return new Date(iso).toLocaleDateString('ko-KR');
  },
  dDay(s) {
    const d = new Date(s), t = new Date();
    d.setHours(0,0,0,0); t.setHours(0,0,0,0);
    const n = Math.round((d - t) / 86400000);
    return n === 0 ? 'D-Day' : n > 0 ? `D-${n}` : `D+${-n}`;
  },
  escape(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};

/* ─────────────────────────────────────────
   ⑧ 내부 헬퍼
───────────────────────────────────────── */

/** 시트 CSV 읽기 — export URL 방식 (공개 공유 필요) */
async function _csv(name) {
  const id  = SHEET_IDS[name];
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `구글 시트 로드 실패 [${name}] HTTP ${res.status}\n` +
      `파일을 "링크 있는 모든 사용자 - 뷰어"로 공개 공유했는지 확인하세요.\n` +
      `시트 ID: ${id}`
    );
  }
  return _parse(await res.text());
}

/** Apps Script 경유 쓰기 (MODE A) */
async function _write(name, body) {
  const url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type':'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apps Script 오류 [${name}] HTTP ${res.status}`);
  const j = await res.json();
  if (j?.error) throw new Error(j.error);
  return j;
}

/** CSV 텍스트 → 객체 배열 */
function _parse(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = _splitLine(lines[0]);
  return lines.slice(1)
    .map(l => {
      const vals = _splitLine(l);
      const obj  = {};
      headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
      return obj;
    })
    .filter(o => Object.values(o).some(Boolean));
}

/** CSV 한 줄 파싱 (따옴표 포함) */
function _splitLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** assignments 행 정규화 */
function _parseRows(rows) {
  return rows
    .filter(r => r.id && r.title)
    .map(r => ({
      id:          r.id,
      title:       r.title,
      description: r.description || '',
      due_date:    r.due_date    || null,
      status:      r.status      || 'todo',
      mentee_id:   r.mentee_id   || 'all',
      mentee_name: r.mentee_name || '',
      feedback:    r.feedback    || '',
      created_at:  r.created_at  || _now(),
      profiles:    { display_name: r.mentee_name || '—' },
    }));
}

function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _now() { return new Date().toISOString(); }

function _mkSession(u) {
  return {
    user: {
      id:    u.id || _uuid(),
      email: u.email,
      user_metadata: {
        display_name: u.display_name || u.email.split('@')[0],
        role:         u.role         || 'mentee',
      },
    },
    expires_at: Date.now() + 8 * 3600_000,
  };
}
