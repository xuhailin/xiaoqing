/**
 * 桌面端右侧对话面板：拉取最新会话、展示消息、发送、进入主页
 * 依赖：CONFIG（config.js）、window.__TAURI__（可选，用于打开主页）
 */
(function () {
  const BASE = typeof CONFIG !== 'undefined' ? CONFIG.BACKEND_URL : 'http://localhost:3000';
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const homeBtn = document.getElementById('btn-home');

  let conversationId = null;
  let loading = false;
  let errorEl = null;

  function showError(msg) {
    clearError();
    errorEl = document.createElement('div');
    errorEl.className = 'notification--error';
    errorEl.textContent = msg;
    messagesEl.appendChild(errorEl);
  }

  function clearError() {
    if (errorEl && errorEl.parentNode) {
      errorEl.parentNode.removeChild(errorEl);
      errorEl = null;
    }
  }

  function renderMessages(messages) {
    clearError();
    if (!messages || messages.length === 0) {
      messagesEl.innerHTML = '<div class="empty-hint">还没有消息，直接输入发送吧</div>';
      return;
    }
    messagesEl.innerHTML = messages
      .map(function (m) {
        const role = m.role === 'user' ? 'user' : 'assistant';
        const label = m.role === 'user' ? '我' : 'AI';
        const content = escapeHtml(m.content || '');
        return (
          '<div class="message ' +
          role +
          '">' +
          '<span class="role-label">' +
          escapeHtml(label) +
          '</span>' +
          '<div class="bubble">' +
          content +
          '</div></div>'
        );
      })
      .join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setLoading(value) {
    loading = value;
    sendBtn.disabled = loading || !inputEl.value.trim();
    sendBtn.textContent = loading ? '发送中...' : '发送';
  }

  function updateSendButton() {
    sendBtn.disabled = loading || !inputEl.value.trim();
  }

  async function fetchCurrent() {
    const res = await fetch(BASE + '/conversations/current');
    if (!res.ok) throw new Error('获取会话失败');
    const data = await res.json();
    return data.id;
  }

  async function fetchMessages(cid) {
    const res = await fetch(BASE + '/conversations/' + cid + '/messages');
    if (!res.ok) throw new Error('获取消息失败');
    return res.json();
  }

  async function sendMessage(cid, content) {
    const res = await fetch(BASE + '/conversations/' + cid + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || '发送失败');
    }
    return res.json();
  }

  async function init() {
    try {
      conversationId = await fetchCurrent();
      const list = await fetchMessages(conversationId);
      renderMessages(list);
    } catch (e) {
      showError(e.message || '加载失败');
    }
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!conversationId || !text || loading) return;
    setLoading(true);
    clearError();
    try {
      const res = await sendMessage(conversationId, text);
      inputEl.value = '';
      updateSendButton();
      const list = await fetchMessages(conversationId);
      renderMessages(list);
    } catch (e) {
      showError(e.message || '发送失败');
    } finally {
      setLoading(false);
    }
  }

  function openHome() {
    const tauri = window.__TAURI__;
    const url = typeof CONFIG !== 'undefined' ? CONFIG.CHAT_URL : 'http://localhost:4200';
    if (tauri?.opener?.openUrl) {
      tauri.opener.openUrl(url).catch(function (err) {
        console.error('[chat-panel] openUrl failed:', err);
      });
    }
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', send);
  }
  if (inputEl) {
    inputEl.addEventListener('input', updateSendButton);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }
  if (homeBtn) {
    homeBtn.addEventListener('click', openHome);
  }

  init();
})();
