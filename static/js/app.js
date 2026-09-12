// LMMS FBLA Web Application - Frontend Client

// API Client connecting to Flask Backend
const api = {
  async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || result.message || 'Request failed');
    return result;
  },
  async put(endpoint, data) {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || result.message || 'Request failed');
    return result;
  },
  async del(endpoint) {
    const res = await fetch(endpoint, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || result.message || 'Request failed');
    return result;
  }
};

// Resource endpoint helper
const getResourceEndpoint = (type) => {
  const map = {
    announcement: 'announcements',
    announcements: 'announcements',
    minute: 'minutes',
    minutes: 'minutes',
    roster: 'roster',
    event: 'events',
    events: 'events',
    gallery: 'gallery',
    resource: 'resources',
    resources: 'resources'
  };
  return `/api/${map[type] || type}`;
};

// Utility functions
const escapeHtml = (unsafe) => {
  return (unsafe || '').toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', options);
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return { month: '', day: '' };
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate()
  };
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const showToast = (message, type = 'success') => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.cssText = `
    padding: 12px 20px;
    margin-top: 10px;
    border-radius: 8px;
    background: ${type === 'error' ? '#e74c3c' : '#2ecc71'};
    color: white;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
  `;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button style="background:none;border:none;color:white;cursor:pointer;font-size:1.2rem;margin-left:15px;">&times;</button>
  `;
  toast.querySelector('button').onclick = () => toast.remove();
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3500);
};

// Global settings sync (updates SchoolPay buttons across the site)
const updateGlobalSettingsUI = async () => {
  try {
    const settings = await api.get('/api/election-settings');
    if (settings && settings.schoolPayUrl) {
      document.querySelectorAll('.schoolpay-btn').forEach(btn => {
        btn.setAttribute('href', settings.schoolPayUrl);
      });
    }
  } catch (err) {
    console.error('Error fetching election settings:', err);
  }
};

// Automated 24h Meeting Reminder Banner Checker
const checkMeetingReminderBanner = async () => {
  try {
    const events = await api.get('/api/events');
    const meetings = events.filter(e => (e.category || '').toLowerCase() === 'meeting');
    if (meetings.length === 0) return;

    const now = new Date();
    // Sort upcoming meetings
    const upcomingMeetings = meetings.filter(m => {
      const eventDate = new Date(m.date + (m.date.includes('T') ? '' : 'T00:00:00'));
      // Event date is today or in future
      return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (upcomingMeetings.length === 0) return;

    const nextMeeting = upcomingMeetings[0];
    const meetingDate = new Date(nextMeeting.date + (nextMeeting.date.includes('T') ? '' : 'T00:00:00'));
    const diffHours = (meetingDate - now) / (1000 * 60 * 60);

    // If meeting is within the next 24 hours (or today/tomorrow)
    const isWithin24h = diffHours >= -12 && diffHours <= 36;
    const banner = document.getElementById('meeting-reminder-banner');
    const bannerText = document.getElementById('banner-text');

    if (isWithin24h && banner && bannerText) {
      const dismissed = localStorage.getItem(`dismissed_banner_${nextMeeting.id}`);
      if (!dismissed) {
        bannerText.innerHTML = `⏰ <strong>Upcoming Meeting Reminder:</strong> ${escapeHtml(nextMeeting.title)} is scheduled for <strong>${formatDate(nextMeeting.date)} at ${escapeHtml(nextMeeting.time)}</strong> (${escapeHtml(nextMeeting.location)})!`;
        banner.classList.remove('hidden');

        const closeBtn = document.getElementById('banner-close-btn');
        if (closeBtn) {
          closeBtn.onclick = () => {
            banner.classList.add('hidden');
            localStorage.setItem(`dismissed_banner_${nextMeeting.id}`, 'true');
          };
        }
      }
    }
  } catch (err) {
    console.error('Error checking meeting reminder banner:', err);
  }
};

// Router
const router = async () => {
  const hash = window.location.hash || '#home';
  const pages = document.querySelectorAll('.page');
  const navLinks = document.querySelectorAll('.nav-links a');
  
  pages.forEach(p => p.classList.remove('active'));
  
  navLinks.forEach(l => {
    l.classList.remove('active');
    if (l.getAttribute('href') === hash) {
      l.classList.add('active');
    }
  });

  const targetPage = document.querySelector(hash);
  if (targetPage) {
    targetPage.classList.add('active');
    
    switch (hash) {
      case '#home': renderHome(); break;
      case '#announcements': renderAnnouncements(); break;
      case '#minutes': renderMinutes(); break;
      case '#roster': renderRoster(); break;
      case '#events': renderEvents(); break;
      case '#elections': renderElections(); break;
      case '#motm': renderMOTM(); break;
      case '#gallery': renderGallery(); break;
      case '#resources': renderResources(); break;
      case '#admin': adminInit(); break;
    }
  }

  updateGlobalSettingsUI();
  checkMeetingReminderBanner();
  initIntersectionObserver();
  if (hash === '#home') animateStats();
};

// Page Renderers
const renderHome = async () => {
  try {
    const data = await api.get('/api/announcements');
    const sorted = [...data].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 3);
    
    const container = document.getElementById('home-announcements');
    if (!container) return;
    
    if (sorted.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No announcements yet.</p>';
      return;
    }

    container.innerHTML = sorted.map(ann => `
      <div class="card announcement-card ${ann.pinned ? 'pinned' : ''}">
        <div class="announcement-meta">
          <span class="category-badge ${ann.category === 'Important' ? 'important' : ''}">${escapeHtml(ann.category)}</span>
          <span class="announcement-date">${formatDate(ann.date)}</span>
        </div>
        <h3>${escapeHtml(ann.title)}</h3>
        <p>${escapeHtml(ann.content.length > 120 ? ann.content.substring(0, 120) + '...' : ann.content)}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering home:', err);
  }
};

const renderAnnouncements = async () => {
  try {
    const data = await api.get('/api/announcements');
    const pinned = data.filter(a => a.pinned).sort((a, b) => new Date(b.date) - new Date(a.date));
    const unpinned = data.filter(a => !a.pinned).sort((a, b) => new Date(b.date) - new Date(a.date));
    const combined = [...pinned, ...unpinned];
    
    const container = document.getElementById('announcements-list');
    if (!container) return;

    if (combined.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No announcements available.</p>';
      return;
    }

    container.innerHTML = combined.map(ann => `
      <div class="card announcement-card ${ann.pinned ? 'pinned' : ''}">
        <div class="announcement-meta">
          <span class="category-badge ${ann.category === 'Important' ? 'important' : ''}">${escapeHtml(ann.category)}</span>
          <span class="announcement-date">${formatDate(ann.date)}</span>
        </div>
        <h3>${escapeHtml(ann.title)}</h3>
        <p>${escapeHtml(ann.content)}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering announcements:', err);
  }
};

const renderMinutes = async () => {
  try {
    const data = await api.get('/api/minutes');
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const container = document.getElementById('minutes-list');
    if (!container) return;

    if (sorted.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No meeting minutes recorded yet.</p>';
      return;
    }

    container.innerHTML = sorted.map(min => {
      const items = min.agendaItems || min.agenda || [];
      const agendaHtml = items.map(item => {
        if (typeof item === 'object' && item !== null) {
          return `<li><strong>${escapeHtml(item.title || '')}</strong>${item.description ? ` — ${escapeHtml(item.description)}` : ''}</li>`;
        }
        return `<li>${escapeHtml(item)}</li>`;
      }).join('');

      return `
        <details class="minute-item" style="margin-bottom: 20px;">
          <summary style="padding: 16px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: var(--navy-light); border-radius: 10px;">
            <strong style="font-size: 1.1rem; color: var(--white);">${escapeHtml(min.title)}</strong>
            <span style="color: var(--gold); font-size: 0.9rem;">${formatDate(min.date)}</span>
          </summary>
          <div class="minute-body" style="padding: 20px; background: var(--navy); border: 1px solid var(--white-10); border-radius: 0 0 10px 10px; border-top: none;">
            <div class="minute-meta-box" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 14px; background: var(--navy-lighter); border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem;">
              <div><span>Called to Order:</span> <strong>${escapeHtml(min.calledToOrder || 'N/A')}</strong></div>
              <div><span>Adjourned:</span> <strong>${escapeHtml(min.adjournedAt || 'N/A')}</strong></div>
              <div><span>Attendance:</span> <strong>${escapeHtml(min.attendance || '0')}</strong></div>
              <div><span>Advisor:</span> <strong>${escapeHtml(min.advisor || 'N/A')}</strong></div>
              <div><span>Recorder:</span> <strong>${escapeHtml(min.recorder || 'Secretary')}</strong></div>
            </div>
            <h4 style="color: var(--gold); margin-bottom: 10px;">Agenda & Meeting Notes</h4>
            <ol style="padding-left: 20px; color: var(--white-80); line-height: 1.8;">
              ${agendaHtml || '<li>No agenda items listed</li>'}
            </ol>
          </div>
        </details>
      `;
    }).join('');
  } catch (err) {
    console.error('Error rendering minutes:', err);
  }
};

const renderRoster = async () => {
  try {
    const data = await api.get('/api/roster');
    const officers = data.filter(m => m.role === 'officer');
    const members = data.filter(m => m.role !== 'officer').sort((a, b) => a.name.localeCompare(b.name));
    
    const officersGrid = document.getElementById('officers-grid');
    if (officersGrid) {
      officersGrid.innerHTML = officers.map(off => `
        <div class="card officer-card" style="text-align: center; padding: 24px; position: relative;">
          <span style="position: absolute; top: 12px; right: 12px; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px; background: ${off.duesPaid ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'}; color: ${off.duesPaid ? '#2ecc71' : '#e74c3c'}; border: 1px solid ${off.duesPaid ? '#2ecc71' : '#e74c3c'};">
            ${off.duesPaid ? '✓ $15 Dues Paid' : 'Dues Pending'}
          </span>
          <div class="officer-avatar" style="width: 72px; height: 72px; background: var(--navy-lighter); color: var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; margin: 10px auto 16px; border: 2px solid var(--gold);">${getInitials(off.name)}</div>
          <h3 class="officer-name" style="font-size: 1.1rem; margin-bottom: 4px; font-family: 'Inter', sans-serif;">${escapeHtml(off.name)}</h3>
          <div class="officer-title" style="color: var(--gold); font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">${escapeHtml(off.officerTitle || 'Officer')}</div>
          <div class="officer-grade" style="color: var(--white-60); font-size: 0.85rem;">${escapeHtml(off.grade)} Grade</div>
        </div>
      `).join('');
    }
    
    const membersTable = document.getElementById('members-table');
    if (membersTable) {
      membersTable.innerHTML = members.map(m => `
        <tr>
          <td style="padding: 12px 16px; font-weight: 500;">${escapeHtml(m.name)}</td>
          <td style="padding: 12px 16px;">${escapeHtml(m.grade)}</td>
          <td style="padding: 12px 16px;"><span class="category-badge" style="background: var(--navy-lighter); color: var(--white-80);">Member</span></td>
          <td style="padding: 12px 16px;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; background: ${m.duesPaid ? 'rgba(46,204,113,0.2)' : 'rgba(241,196,15,0.2)'}; color: ${m.duesPaid ? '#2ecc71' : '#f1c40f'}; border: 1px solid ${m.duesPaid ? '#2ecc71' : '#f1c40f'};">
              ${m.duesPaid ? '✓ Paid ($15)' : 'Dues Pending'}
            </span>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error rendering roster:', err);
  }
};

const renderEvents = async () => {
  try {
    const data = await api.get('/api/events');
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const container = document.getElementById('events-list');
    if (!container) return;

    if (sorted.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No upcoming events scheduled.</p>';
      return;
    }

    container.innerHTML = sorted.map(ev => {
      const { month, day } = formatDateShort(ev.date);
      return `
        <div class="timeline-item">
          <div class="timeline-date-box">
            <span class="timeline-month">${month}</span>
            <span class="timeline-day">${day}</span>
          </div>
          <div class="timeline-content">
            <div class="timeline-header">
              <h3 class="timeline-title">${escapeHtml(ev.title)}</h3>
              <span class="category-badge">${escapeHtml(ev.category)}</span>
            </div>
            <div class="timeline-meta" style="margin: 8px 0; color: var(--white-60); font-size: 0.85rem; display: flex; gap: 16px;">
              <span>🕒 ${escapeHtml(ev.time)}</span>
              <span>📍 ${escapeHtml(ev.location)}</span>
            </div>
            <p>${escapeHtml(ev.description)}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error rendering events:', err);
  }
};

// Render Elections Page
const renderElections = async () => {
  try {
    const settings = await api.get('/api/election-settings');
    const candidates = await api.get('/api/candidates');
    
    const pageTitle = document.getElementById('election-page-title');
    const disabledMsg = document.getElementById('election-disabled-msg');
    const activeContent = document.getElementById('election-active-content');
    const container = document.getElementById('candidates-grid');
    
    if (pageTitle && settings.title) {
      pageTitle.textContent = settings.title;
    }

    if (!settings.enabled) {
      if (disabledMsg) disabledMsg.classList.remove('hidden');
      if (activeContent) activeContent.classList.add('hidden');
      return;
    } else {
      if (disabledMsg) disabledMsg.classList.add('hidden');
      if (activeContent) activeContent.classList.remove('hidden');
    }

    if (!container) return;

    if (candidates.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60); text-align: center; grid-column: 1/-1;">No candidates approved yet for this election session.</p>';
      return;
    }

    container.innerHTML = candidates.map(cand => `
      <div class="card candidate-card" style="padding: 24px; border: 1px solid var(--gold); position: relative;">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
          <div class="candidate-avatar" style="width: 60px; height: 60px; border-radius: 50%; background: var(--navy-lighter); border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; color: var(--gold); font-size: 1.3rem; font-weight: 700;">
            ${getInitials(cand.name)}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.2rem; font-family: 'Inter', sans-serif; color: var(--white);">${escapeHtml(cand.name)}</h3>
            <div style="color: var(--gold); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Running for: ${escapeHtml(cand.targetRole)}</div>
            <div style="color: var(--white-60); font-size: 0.8rem;">${escapeHtml(cand.grade)} Grade</div>
          </div>
        </div>
        
        <div style="margin-bottom: 12px; background: var(--navy-lighter); padding: 12px; border-radius: 8px;">
          <div style="color: var(--gold); font-weight: 600; font-size: 0.8rem; margin-bottom: 4px;">💬 Campaign Vision:</div>
          <p style="margin: 0; color: var(--white-80); font-size: 0.95rem; font-style: italic;">"${escapeHtml(cand.statement)}"</p>
        </div>

        <div style="font-size: 0.9rem; color: var(--white-60);">
          <strong style="color: var(--white);">Experience & Qualifications:</strong> ${escapeHtml(cand.qualifications)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering elections:', err);
  }
};

// Render Member of the Month (MOTM) Page
const renderMOTM = async () => {
  try {
    const data = await api.get('/api/motm');
    const poll = data.activePoll || {};
    const winners = data.winners || [];

    // Poll title
    const pollTitleEl = document.getElementById('motm-poll-title');
    if (pollTitleEl && poll.title) pollTitleEl.textContent = poll.title;

    // Nominees list
    const nomineesContainer = document.getElementById('motm-poll-nominees');
    if (nomineesContainer) {
      if (!poll.enabled || !poll.nominees || poll.nominees.length === 0) {
        nomineesContainer.innerHTML = '<p style="color: var(--white-60); grid-column: 1/-1;">Voting for Member of the Month is currently closed.</p>';
      } else {
        nomineesContainer.innerHTML = poll.nominees.map(nom => `
          <div class="card" style="padding: 20px; text-align: center; border: 1px solid var(--white-10); background: var(--navy-lighter);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--navy); border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; color: var(--gold); font-weight: 700; font-size: 1.2rem; margin: 0 auto 12px;">
              ${getInitials(nom.name)}
            </div>
            <h4 style="font-family: 'Inter', sans-serif; font-size: 1.05rem; margin-bottom: 4px;">${escapeHtml(nom.name)}</h4>
            <div style="color: var(--gold); font-size: 0.8rem; font-weight: 600; margin-bottom: 8px;">${escapeHtml(nom.grade)} Grade</div>
            <p style="color: var(--white-80); font-size: 0.85rem; margin-bottom: 16px;">${escapeHtml(nom.reason)}</p>
            <button class="btn btn-primary btn-sm" style="background: var(--gold); color: var(--navy-dark); font-weight: 700; width: 100%;" onclick="voteMOTM('${nom.id}')">Vote for ${escapeHtml(nom.name.split(' ')[0])} 🗳️</button>
          </div>
        `).join('');
      }
    }

    // Past winners hall of fame
    const winnersContainer = document.getElementById('motm-winners-grid');
    if (winnersContainer) {
      if (winners.length === 0) {
        winnersContainer.innerHTML = '<p style="color: var(--white-60);">No past winners published yet.</p>';
      } else {
        winnersContainer.innerHTML = winners.map(w => `
          <div class="card" style="padding: 24px; border: 1px solid var(--gold); display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
            <img src="${escapeHtml(w.photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500')}" alt="${escapeHtml(w.name)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--gold);">
            <div style="flex: 1;">
              <span class="badge" style="background: rgba(232,184,75,0.2); color: var(--gold); font-size: 0.75rem; padding: 4px 10px; border-radius: 12px;">🏆 ${escapeHtml(w.month)}</span>
              <h3 style="margin: 8px 0 2px 0; font-family: 'Inter', sans-serif; font-size: 1.2rem; color: var(--white);">${escapeHtml(w.name)}</h3>
              <div style="color: var(--white-60); font-size: 0.85rem; margin-bottom: 8px;">${escapeHtml(w.grade)}</div>
              <p style="margin: 0; color: var(--white-80); font-size: 0.9rem; font-style: italic;">"${escapeHtml(w.reason)}"</p>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error rendering MOTM:', err);
  }
};

window.voteMOTM = async (candidateId) => {
  try {
    const res = await api.post('/api/motm/vote', { candidateId });
    showToast(res.message || 'Vote recorded successfully!');
    renderMOTM();
  } catch (err) {
    showToast(err.message || 'Voting failed', 'error');
  }
};

const renderGallery = async () => {
  try {
    const data = await api.get('/api/gallery');
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const container = document.getElementById('gallery-grid');
    if (!container) return;

    if (sorted.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No photos added to gallery yet.</p>';
      return;
    }

    container.innerHTML = sorted.map(item => `
      <div class="gallery-item" onclick="openLightbox('${escapeHtml(item.imageUrl)}', '${escapeHtml(item.caption || item.title)}')">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">
        <div class="gallery-overlay">
          <h4 style="margin:0; font-size: 1rem;">${escapeHtml(item.title)}</h4>
          <small style="opacity:0.8;">${formatDate(item.date)}</small>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering gallery:', err);
  }
};

const renderResources = async () => {
  try {
    const data = await api.get('/api/resources');
    
    const container = document.getElementById('resources-list');
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No resources available.</p>';
      return;
    }

    container.innerHTML = data.map(res => `
      <div class="card resource-card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <span class="category-badge" style="margin-bottom: 12px; display: inline-block;">${escapeHtml(res.category)}</span>
          <h3 style="margin-bottom: 8px;">${escapeHtml(res.title)}</h3>
          <p style="color: var(--white-60); margin-bottom: 16px; font-size: 0.95rem;">${escapeHtml(res.description)}</p>
        </div>
        <a href="${escapeHtml(res.url)}" target="_blank" rel="noopener" class="resource-link" style="color: var(--gold); font-weight: 600; text-decoration: none;">Visit Resource &rarr;</a>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering resources:', err);
  }
};

// Lightbox
const openLightbox = (src, caption) => {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');
  if (lightbox && img && cap) {
    img.src = src;
    cap.textContent = caption;
    lightbox.classList.remove('hidden');
  }
};

const closeLightbox = () => {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.classList.add('hidden');
};

// Admin Auth & Dashboard Init
const adminInit = async () => {
  try {
    const { authenticated } = await api.get('/api/auth');
    const loginForm = document.getElementById('admin-login');
    const dashboard = document.getElementById('admin-dashboard');
    
    if (authenticated) {
      if (loginForm) loginForm.classList.add('hidden');
      if (dashboard) dashboard.classList.remove('hidden');
      const activeTab = document.querySelector('.tab-btn.active');
      const targetTabId = activeTab ? activeTab.getAttribute('data-tab') : 'admin-announcements';
      loadAdminTab(targetTabId);
    } else {
      if (loginForm) loginForm.classList.remove('hidden');
      if (dashboard) dashboard.classList.add('hidden');
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
};

const handleLogin = async (e) => {
  e.preventDefault();
  const pwdInput = document.getElementById('password');
  const pwd = pwdInput.value;
  try {
    await api.post('/api/login', { password: pwd });
    pwdInput.value = '';
    adminInit();
    showToast('Officer access granted');
  } catch (err) {
    showToast(err.message || 'Incorrect password', 'error');
  }
};

const handleLogout = async () => {
  try {
    await api.post('/api/logout');
    adminInit();
    showToast('Logged out');
  } catch (err) {
    console.error('Logout error:', err);
  }
};

// Admin Tab Management
const setupAdminTabs = () => {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
      const targetId = tab.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.remove('hidden');
      
      loadAdminTab(targetId);
    });
  });
};

const loadAdminTab = (tabId) => {
  switch (tabId) {
    case 'admin-announcements': renderAdminList('announcements', renderAdminAnnouncementItem); break;
    case 'admin-minutes': renderAdminList('minutes', renderAdminMinuteItem); break;
    case 'admin-roster': renderAdminList('roster', renderAdminRosterItem); break;
    case 'admin-events': renderAdminList('events', renderAdminEventItem); break;
    case 'admin-elections': loadAdminElectionsTab(); break;
    case 'admin-motm': loadAdminMOTMTab(); break;
    case 'admin-gallery': renderAdminList('gallery', renderAdminGalleryItem); break;
    case 'admin-resources': renderAdminList('resources', renderAdminResourceItem); break;
  }
};

// Generic Admin List Renderer
const renderAdminList = async (type, itemRenderer) => {
  try {
    const data = await api.get(`/api/${type}`);
    const listEl = document.getElementById(`admin-${type}-list`);
    if (!listEl) return;
    
    if (data.length === 0) {
      listEl.innerHTML = '<p style="color: var(--white-60); padding: 15px;">No items found.</p>';
      return;
    }

    listEl.innerHTML = data.map(item => `
      <div class="admin-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--navy-light); border: 1px solid var(--white-10); border-radius: 8px; margin-bottom: 10px;">
        <div class="admin-item-content" style="flex: 1;">
          ${itemRenderer(item)}
        </div>
        <div class="admin-item-actions" style="display: flex; gap: 8px; align-items: center;">
          ${type === 'roster' ? `<button class="btn btn-sm" style="background: ${item.duesPaid ? '#2ecc71' : '#f1c40f'}; color: black; font-weight: 700; border: none;" onclick="toggleMemberDues('${item.id}', ${!item.duesPaid})">${item.duesPaid ? '✓ Paid ($15)' : 'Mark $15 Paid'}</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="editItem('${type}', '${item.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" style="background: #e74c3c; border: none; color: white;" onclick="deleteItem('${type}', '${item.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(`Error loading admin list for ${type}:`, err);
  }
};

// Admin Item Renderers
const renderAdminAnnouncementItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.title)} ${item.pinned ? '📌' : ''}</div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${escapeHtml(item.category)} | ${formatDate(item.date)}</div>
`;
const renderAdminMinuteItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.title)}</div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${formatDate(item.date)} | ${escapeHtml(item.attendance || 0)} attendees</div>
`;
const renderAdminRosterItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.name)} <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: ${item.duesPaid ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}; color: ${item.duesPaid ? '#2ecc71' : '#e74c3c'};">${item.duesPaid ? 'Dues Paid' : 'Dues Pending'}</span></div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${escapeHtml(item.role)} | ${escapeHtml(item.grade)} Grade ${item.officerTitle ? `- ${escapeHtml(item.officerTitle)}` : ''}</div>
`;
const renderAdminEventItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.title)}</div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${formatDate(item.date)} | ${escapeHtml(item.category)}</div>
`;
const renderAdminGalleryItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.title)}</div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${formatDate(item.date)}</div>
`;
const renderAdminResourceItem = (item) => `
  <div class="admin-item-title" style="font-weight: 600; font-size: 1rem;">${escapeHtml(item.title)}</div>
  <div class="admin-item-meta" style="color: var(--white-60); font-size: 0.85rem;">${escapeHtml(item.category)}</div>
`;

// Toggle Member Dues directly from Admin Roster
window.toggleMemberDues = async (memberId, newStatus) => {
  try {
    await api.put(`/api/roster/${memberId}`, { duesPaid: newStatus });
    showToast(newStatus ? 'Marked $15 dues as paid!' : 'Marked dues as pending');
    renderAdminList('roster', renderAdminRosterItem);
  } catch (err) {
    showToast('Failed to update dues status', 'error');
  }
};

// Admin Elections & Settings Tab Handler
const loadAdminElectionsTab = async () => {
  try {
    const settings = await api.get('/api/election-settings');
    const candidates = await api.get('/api/candidates');

    document.getElementById('setting-election-enabled').checked = settings.enabled || false;
    document.getElementById('setting-election-title').value = settings.title || '';
    document.getElementById('setting-schoolpay-url').value = settings.schoolPayUrl || '';

    const container = document.getElementById('admin-candidates-list');
    if (!container) return;

    if (candidates.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No candidate applications received yet.</p>';
      return;
    }

    container.innerHTML = candidates.map(cand => `
      <div class="admin-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--navy-light); border: 1px solid var(--white-10); border-radius: 8px; margin-bottom: 10px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 1rem; color: var(--white);">
            ${escapeHtml(cand.name)} <span style="font-size: 0.8rem; color: var(--gold);">(${escapeHtml(cand.targetRole)})</span>
            <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; font-weight: 700; background: ${cand.status === 'approved' ? 'rgba(46,204,113,0.3)' : (cand.status === 'rejected' ? 'rgba(231,76,60,0.3)' : 'rgba(241,196,15,0.3)')}; color: ${cand.status === 'approved' ? '#2ecc71' : (cand.status === 'rejected' ? '#e74c3c' : '#f1c40f')};">
              ${cand.status ? cand.status.toUpperCase() : 'PENDING'}
            </span>
          </div>
          <div style="color: var(--white-80); font-size: 0.85rem; margin-top: 4px;">"${escapeHtml(cand.statement)}"</div>
          <div style="color: var(--white-60); font-size: 0.8rem; margin-top: 2px;">Grade: ${escapeHtml(cand.grade)} | Quals: ${escapeHtml(cand.qualifications)}</div>
        </div>
        <div class="admin-item-actions" style="display: flex; gap: 8px;">
          ${cand.status !== 'approved' ? `<button class="btn btn-sm" style="background: #2ecc71; color: black; font-weight: 700; border: none;" onclick="setCandidateStatus('${cand.id}', 'approved')">Approve</button>` : ''}
          ${cand.status !== 'rejected' ? `<button class="btn btn-sm" style="background: #f1c40f; color: black; font-weight: 700; border: none;" onclick="setCandidateStatus('${cand.id}', 'rejected')">Reject</button>` : ''}
          <button class="btn btn-danger btn-sm" style="background: #e74c3c; border: none; color: white;" onclick="deleteCandidate('${cand.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading admin elections:', err);
  }
};

window.setCandidateStatus = async (id, status) => {
  try {
    await api.put(`/api/candidates/${id}`, { status });
    showToast(`Candidate ${status}`);
    loadAdminElectionsTab();
  } catch (err) {
    showToast('Failed to update candidate', 'error');
  }
};

window.deleteCandidate = async (id) => {
  if (confirm('Delete candidate application?')) {
    try {
      await api.del(`/api/candidates/${id}`);
      showToast('Candidate deleted');
      loadAdminElectionsTab();
    } catch (err) {
      showToast('Failed to delete candidate', 'error');
    }
  }
};

// Admin MOTM & Resend Invitations Handler
const loadAdminMOTMTab = async () => {
  try {
    const data = await api.get('/api/motm');
    const winners = data.winners || [];

    const container = document.getElementById('admin-motm-winners-list');
    if (!container) return;

    if (winners.length === 0) {
      container.innerHTML = '<p style="color: var(--white-60);">No MOTM winners in archive.</p>';
      return;
    }

    container.innerHTML = winners.map(w => `
      <div class="admin-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: var(--navy-light); border: 1px solid var(--white-10); border-radius: 8px; margin-bottom: 10px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 1rem; color: var(--white);">
            ${escapeHtml(w.name)} <span style="font-size: 0.8rem; color: var(--gold);">(${escapeHtml(w.month)})</span>
          </div>
          <div style="color: var(--white-80); font-size: 0.85rem; margin-top: 2px;">Grade: ${escapeHtml(w.grade)} | "${escapeHtml(w.reason)}"</div>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-danger btn-sm" style="background: #e74c3c; border: none; color: white;" onclick="deleteMOTMWinner('${w.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading admin MOTM:', err);
  }
};

window.deleteMOTMWinner = async (id) => {
  if (confirm('Remove winner from hall of fame?')) {
    try {
      await api.del(`/api/motm/winner/${id}`);
      showToast('Winner removed');
      loadAdminMOTMTab();
    } catch (err) {
      showToast('Failed to delete winner', 'error');
    }
  }
};

// Admin Forms Setup
const setupAdminForms = () => {
  document.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      resetForm(type);
      const form = document.getElementById(`form-${type}`);
      const list = document.getElementById(`admin-${type === 'minute' ? 'minutes' : (type === 'resource' ? 'resources' : type + 's')}-list`);
      if (form) form.classList.remove('hidden');
      if (list) list.classList.add('hidden');
    });
  });

  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const form = e.target.closest('form');
      if (form) {
        form.classList.add('hidden');
        const type = form.id.replace('form-', '');
        const list = document.getElementById(`admin-${type === 'minute' ? 'minutes' : (type === 'resource' ? 'resources' : type + 's')}-list`);
        if (list) list.classList.remove('hidden');
      }
    });
  });
  
  const roleSelect = document.getElementById('roster-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      const titleGroup = document.getElementById('officer-title-group');
      if (titleGroup) titleGroup.style.display = e.target.value === 'officer' ? 'block' : 'none';
    });
  }

  const types = ['announcement', 'minute', 'roster', 'event', 'gallery', 'resource'];
  types.forEach(type => {
    const form = document.getElementById(`form-${type}`);
    if (form) form.addEventListener('submit', (e) => handleFormSubmit(e, type));
  });

  // Settings form submit
  const settingsForm = document.getElementById('form-election-settings');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enabled = document.getElementById('setting-election-enabled').checked;
      const title = document.getElementById('setting-election-title').value;
      const schoolPayUrl = document.getElementById('setting-schoolpay-url').value;
      try {
        await api.post('/api/election-settings', { enabled, title, schoolPayUrl });
        showToast('Settings saved successfully!');
        updateGlobalSettingsUI();
      } catch (err) {
        showToast('Failed to save settings', 'error');
      }
    });
  }

  // Resend Email Invite submit
  const resendInviteForm = document.getElementById('form-resend-invite');
  if (resendInviteForm) {
    resendInviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resend-invite-email').value;
      try {
        const res = await api.post('/api/invite-admin', { email });
        showToast(res.message || `Admin invitation sent to ${email}!`);
        resendInviteForm.reset();
      } catch (err) {
        showToast(err.message || 'Failed to send invitation email', 'error');
      }
    });
  }

  // MOTM Winner Publish form submit
  const motmWinnerForm = document.getElementById('form-motm-winner');
  if (motmWinnerForm) {
    motmWinnerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('motm-winner-name').value;
      const month = document.getElementById('motm-winner-month').value;
      const grade = document.getElementById('motm-winner-grade').value;
      const photoUrl = document.getElementById('motm-winner-photo').value;
      const reason = document.getElementById('motm-winner-reason').value;

      try {
        await api.post('/api/motm/winner', { name, month, grade, photoUrl, reason });
        showToast(`Published ${name} as Member of the Month!`);
        motmWinnerForm.reset();
        loadAdminMOTMTab();
      } catch (err) {
        showToast('Failed to publish winner', 'error');
      }
    });
  }

  // Candidate public apply form submit
  const candidateApplyForm = document.getElementById('form-candidate-apply');
  if (candidateApplyForm) {
    candidateApplyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('candidate-apply-name').value;
      const grade = document.getElementById('candidate-apply-grade').value;
      const targetRole = document.getElementById('candidate-apply-role').value;
      const statement = document.getElementById('candidate-apply-statement').value;
      const qualifications = document.getElementById('candidate-apply-qualifications').value;

      try {
        const res = await api.post('/api/candidates/apply', { name, grade, targetRole, statement, qualifications });
        showToast(res.message || 'Application submitted for officer review!');
        candidateApplyForm.reset();
        document.getElementById('candidate-modal').classList.add('hidden');
      } catch (err) {
        showToast(err.message || 'Failed to submit application', 'error');
      }
    });
  }

  const addAgendaBtn = document.getElementById('btn-add-agenda');
  if (addAgendaBtn) {
    addAgendaBtn.addEventListener('click', () => {
      const container = document.getElementById('agenda-items-container');
      const div = document.createElement('div');
      div.className = 'agenda-item-row';
      div.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
      div.innerHTML = `
        <input type="text" class="agenda-input" placeholder="Agenda Item" required style="flex: 1; padding: 8px; border-radius: 6px; background: var(--navy-lighter); border: 1px solid var(--white-10); color: white;">
        <button type="button" class="btn btn-danger btn-sm" style="background:#e74c3c; border:none; color:white; padding: 4px 12px; border-radius:6px; cursor:pointer;" onclick="this.parentElement.remove()">X</button>
      `;
      container.appendChild(div);
    });
  }

  // Candidate modal open/close handlers
  const openModalBtn = document.getElementById('btn-open-candidate-modal');
  const closeModalBtn = document.getElementById('btn-close-candidate-modal');
  const cancelModalBtn = document.getElementById('btn-cancel-candidate-apply');
  const modal = document.getElementById('candidate-modal');

  if (openModalBtn && modal) {
    openModalBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  }
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }
  if (cancelModalBtn && modal) {
    cancelModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }
};

const handleFormSubmit = async (e, type) => {
  e.preventDefault();
  const idStr = document.getElementById(`${type}-id`).value;
  const isEdit = idStr !== '';
  let data = {};

  if (type === 'announcement') {
    data = {
      title: document.getElementById('announcement-title').value,
      content: document.getElementById('announcement-content').value,
      category: document.getElementById('announcement-category').value,
      date: document.getElementById('announcement-date').value,
      pinned: document.getElementById('announcement-pinned').checked
    };
  } else if (type === 'minute') {
    const agendaInputs = document.querySelectorAll('.agenda-input');
    const agenda = Array.from(agendaInputs).map(i => i.value).filter(v => v.trim() !== '');
    data = {
      title: document.getElementById('minute-title').value,
      date: document.getElementById('minute-date').value,
      calledToOrder: document.getElementById('minute-called').value,
      adjournedAt: document.getElementById('minute-adjourned').value,
      attendance: parseInt(document.getElementById('minute-attendance').value || '0'),
      advisor: document.getElementById('minute-advisor').value,
      recorder: document.getElementById('minute-recorder').value,
      agendaItems: agenda
    };
  } else if (type === 'roster') {
    data = {
      name: document.getElementById('roster-name').value,
      grade: document.getElementById('roster-grade').value,
      role: document.getElementById('roster-role').value,
      officerTitle: document.getElementById('roster-title').value,
      duesPaid: document.getElementById('roster-dues-paid').checked
    };
  } else if (type === 'event') {
    data = {
      title: document.getElementById('event-title').value,
      category: document.getElementById('event-category').value,
      date: document.getElementById('event-date').value,
      time: document.getElementById('event-time').value,
      location: document.getElementById('event-location').value,
      description: document.getElementById('event-description').value
    };
  } else if (type === 'gallery') {
    data = {
      title: document.getElementById('gallery-title').value,
      imageUrl: document.getElementById('gallery-url').value,
      caption: document.getElementById('gallery-caption').value,
      event: document.getElementById('gallery-event').value,
      date: document.getElementById('gallery-date').value
    };
  } else if (type === 'resource') {
    data = {
      title: document.getElementById('resource-title').value,
      url: document.getElementById('resource-url').value,
      category: document.getElementById('resource-category').value,
      description: document.getElementById('resource-description').value
    };
  }

  const endpoint = getResourceEndpoint(type);

  try {
    if (isEdit) {
      await api.put(`${endpoint}/${idStr}`, data);
      showToast(`${type.toUpperCase()} updated successfully`);
    } else {
      await api.post(endpoint, data);
      showToast(`${type.toUpperCase()} created successfully`);
    }
    
    const form = document.getElementById(`form-${type}`);
    const pluralType = type === 'minute' ? 'minutes' : (type === 'resource' ? 'resources' : type + 's');
    const list = document.getElementById(`admin-${pluralType}-list`);
    
    if (form) form.classList.add('hidden');
    if (list) list.classList.remove('hidden');
    loadAdminTab(`admin-${pluralType}`);
  } catch (err) {
    showToast(err.message || 'Error saving data', 'error');
  }
};

window.editItem = async (typeResource, id) => {
  const endpoint = getResourceEndpoint(typeResource);
  try {
    const data = await api.get(endpoint);
    const item = data.find(i => i.id === id);
    if (!item) return;

    let typeSingular = typeResource;
    if (typeSingular.endsWith('s')) typeSingular = typeSingular.slice(0, -1);
    if (typeResource === 'minutes') typeSingular = 'minute';
    if (typeResource === 'resources') typeSingular = 'resource';

    resetForm(typeSingular);
    document.getElementById(`${typeSingular}-id`).value = item.id;

    if (typeSingular === 'announcement') {
      document.getElementById('announcement-title').value = item.title || '';
      document.getElementById('announcement-content').value = item.content || '';
      document.getElementById('announcement-category').value = item.category || 'General';
      document.getElementById('announcement-date').value = item.date || '';
      document.getElementById('announcement-pinned').checked = item.pinned || false;
    } else if (typeSingular === 'minute') {
      document.getElementById('minute-title').value = item.title || '';
      document.getElementById('minute-date').value = item.date || '';
      document.getElementById('minute-called').value = item.calledToOrder || '';
      document.getElementById('minute-adjourned').value = item.adjournedAt || '';
      document.getElementById('minute-attendance').value = item.attendance || 0;
      document.getElementById('minute-advisor').value = item.advisor || '';
      document.getElementById('minute-recorder').value = item.recorder || '';
      
      const container = document.getElementById('agenda-items-container');
      container.innerHTML = '';
      const items = item.agendaItems || item.agenda || [];
      items.forEach(ag => {
        const text = typeof ag === 'object' ? (ag.title ? `${ag.title}: ${ag.description}` : ag.description) : ag;
        const div = document.createElement('div');
        div.className = 'agenda-item-row';
        div.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
        div.innerHTML = `
          <input type="text" class="agenda-input" value="${escapeHtml(text)}" required style="flex: 1; padding: 8px; border-radius: 6px; background: var(--navy-lighter); border: 1px solid var(--white-10); color: white;">
          <button type="button" class="btn btn-danger btn-sm" style="background:#e74c3c; border:none; color:white; padding: 4px 12px; border-radius:6px; cursor:pointer;" onclick="this.parentElement.remove()">X</button>
        `;
        container.appendChild(div);
      });
    } else if (typeSingular === 'roster') {
      document.getElementById('roster-name').value = item.name || '';
      document.getElementById('roster-grade').value = item.grade || '6th';
      document.getElementById('roster-role').value = item.role || 'member';
      document.getElementById('roster-title').value = item.officerTitle || '';
      document.getElementById('roster-dues-paid').checked = item.duesPaid || false;
      const titleGroup = document.getElementById('officer-title-group');
      if (titleGroup) titleGroup.style.display = item.role === 'officer' ? 'block' : 'none';
    } else if (typeSingular === 'event') {
      document.getElementById('event-title').value = item.title || '';
      document.getElementById('event-category').value = item.category || 'Meeting';
      document.getElementById('event-date').value = item.date || '';
      document.getElementById('event-time').value = item.time || '';
      document.getElementById('event-location').value = item.location || '';
      document.getElementById('event-description').value = item.description || '';
    } else if (typeSingular === 'gallery') {
      document.getElementById('gallery-title').value = item.title || '';
      document.getElementById('gallery-url').value = item.imageUrl || '';
      document.getElementById('gallery-caption').value = item.caption || '';
      document.getElementById('gallery-event').value = item.event || '';
      document.getElementById('gallery-date').value = item.date || '';
    } else if (typeSingular === 'resource') {
      document.getElementById('resource-title').value = item.title || '';
      document.getElementById('resource-url').value = item.url || '';
      document.getElementById('resource-category').value = item.category || 'General';
      document.getElementById('resource-description').value = item.description || '';
    }

    const form = document.getElementById(`form-${typeSingular}`);
    const list = document.getElementById(`admin-${getResourceEndpoint(typeResource).replace('/api/', '')}-list`);
    if (form) form.classList.remove('hidden');
    if (list) list.classList.add('hidden');
  } catch (err) {
    console.error('Error fetching item for edit:', err);
  }
};

window.deleteItem = async (typeResource, id) => {
  if (confirm('Are you sure you want to delete this item?')) {
    try {
      const endpoint = getResourceEndpoint(typeResource);
      await api.del(`${endpoint}/${id}`);
      showToast('Item deleted');
      const pluralType = getResourceEndpoint(typeResource).replace('/api/', '');
      loadAdminTab(`admin-${pluralType}`);
    } catch (err) {
      showToast(err.message || 'Error deleting item', 'error');
    }
  }
};

const resetForm = (type) => {
  const form = document.getElementById(`form-${type}`);
  if (form) {
    form.reset();
    const idEl = document.getElementById(`${type}-id`);
    if (idEl) idEl.value = '';
    if (type === 'minute') {
      const agContainer = document.getElementById('agenda-items-container');
      if (agContainer) agContainer.innerHTML = '';
    }
    if (type === 'roster') {
      const titleGroup = document.getElementById('officer-title-group');
      if (titleGroup) titleGroup.style.display = 'none';
      const duesEl = document.getElementById('roster-dues-paid');
      if (duesEl) duesEl.checked = false;
    }
  }
};

// Animations
const animateStats = () => {
  const stats = document.querySelectorAll('.stat-number');
  stats.forEach(stat => {
    const target = parseInt(stat.getAttribute('data-target') || '0', 10);
    const duration = 1500;
    const start = performance.now();
    
    const update = (currentTime) => {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      
      stat.textContent = Math.floor(ease * target);
      
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        stat.textContent = target;
      }
    };
    
    requestAnimationFrame(update);
  });
};

const initIntersectionObserver = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
};

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('active'));
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.navbar') && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
      }
    });
  }

  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) {
      if (window.scrollY > 50) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    }
  });

  const lbClose = document.querySelector('.lightbox-close');
  const lightbox = document.getElementById('lightbox');
  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') closeLightbox();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && !lightbox.classList.contains('hidden')) {
      closeLightbox();
    }
  });

  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  
  setupAdminTabs();
  setupAdminForms();

  window.addEventListener('hashchange', router);
  router();
});
