import os
import json
import uuid
import sqlite3
import datetime
import urllib.request
import urllib.error
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, redirect
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'lmms-fbla-secret-key-2026')
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, 'database.db')
ADMIN_PASSWORD_HASH = generate_password_hash('SERVICE')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')

# Database Connection Helper
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def generate_id():
    return str(uuid.uuid4())[:8]

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Database Schema & Initialization
def init_db():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    conn = get_db()
    cursor = conn.cursor()

    # Create Tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS minutes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        calledToOrder TEXT,
        adjournedAt TEXT,
        attendance TEXT,
        advisor TEXT,
        recorder TEXT,
        googleDocUrl TEXT,
        agendaItems TEXT,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS roster (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT NOT NULL,
        role TEXT NOT NULL,
        officerTitle TEXT,
        email TEXT,
        duesPaid INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS gallery (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        imageUrl TEXT NOT NULL,
        caption TEXT,
        event TEXT,
        date TEXT NOT NULL,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT NOT NULL,
        targetRole TEXT NOT NULL,
        statement TEXT NOT NULL,
        qualifications TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        createdAt TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS election_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS motm_polls (
        id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        title TEXT NOT NULL,
        nominees TEXT NOT NULL
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS motm_winners (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        month TEXT NOT NULL,
        grade TEXT NOT NULL,
        photoUrl TEXT,
        reason TEXT NOT NULL,
        createdAt TEXT NOT NULL
    )''')

    conn.commit()

    # Seed Initial Database Data if empty
    cursor.execute('SELECT COUNT(*) FROM announcements')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO announcements (id, title, content, category, date, pinned, createdAt) VALUES 
        ('ann1', 'Welcome Back! First FBLA Meeting of the Year', 'Welcome to another exciting year of FBLA at Little Mill Middle School! Our first meeting will be held on Wednesday, September 16th in Room 204 after school. All interested students are welcome to attend. We will be discussing this year goals, upcoming competitions, and community service projects.', 'Important', '2026-09-08', 1, '2026-09-08T12:00:00'),
        ('ann2', 'Membership Dues Reminder — Pay via SchoolPay', 'FBLA membership dues cover your national and state membership, competition fees, and chapter activities. Please submit your dues via SchoolPay or to Mrs. Johnson by September 30th.', 'Dues', '2026-09-05', 0, '2026-09-05T12:00:00'),
        ('ann3', 'Fall Regional Competition Registration Open', 'Registration is now open for the Fall Regional FBLA Competition. Interested members should sign up by October 15th. See the Events section for more details on available competitive events.', 'Competition', '2026-09-01', 0, '2026-09-01T12:00:00')
        ''')

    cursor.execute('SELECT COUNT(*) FROM roster')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO roster (id, name, grade, role, officerTitle, email, duesPaid, createdAt) VALUES 
        ('ros1', 'Jordan', '8th', 'officer', 'Secretary', 'jordanedanield13@gmail.com', 1, '2026-08-01T12:00:00')
        ''')

    cursor.execute('SELECT COUNT(*) FROM minutes')
    if cursor.fetchone()[0] == 0:
        agenda_json = json.dumps([
            {"title": "Welcome & Introductions", "description": "Officers introduced themselves and welcomed new members to the chapter."},
            {"title": "Overview of FBLA", "description": "Advisor presented an overview of FBLA-ML, its mission, and the benefits of membership."},
            {"title": "Membership Dues", "description": "Membership dues cover national and state fees, due by September 30th. Payment can be made online via SchoolPay."},
            {"title": "Competition Preview", "description": "Vice President discussed available competitive events for the 2026-2027 season."},
            {"title": "Community Service", "description": "The chapter will organize a school supply drive in October."},
            {"title": "Next Meeting", "description": "October 7th, 2026 at 3:15 PM in Room 204."}
        ])
        cursor.execute('''INSERT INTO minutes (id, title, date, calledToOrder, adjournedAt, attendance, advisor, recorder, googleDocUrl, agendaItems, createdAt) VALUES 
        ('min1', 'First Meeting of 2026-2027', '2026-09-16', '3:15 PM', '4:00 PM', '42 members present', 'Mrs. Johnson', 'Jordan (Secretary)', 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing', ?, '2026-09-16T16:00:00')
        ''', (agenda_json,))

    cursor.execute('SELECT COUNT(*) FROM events')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO events (id, title, category, date, time, location, description, createdAt) VALUES 
        ('evt1', 'First Chapter Meeting', 'Meeting', '2026-09-16', '3:15 PM - 4:00 PM', 'Room 204', 'Welcome meeting for all new and returning members.', '2026-09-01T12:00:00'),
        ('evt2', 'October Chapter Meeting', 'Meeting', '2026-10-07', '3:15 PM - 4:00 PM', 'Room 204', 'Competition event selection and community service planning.', '2026-09-01T12:00:00'),
        ('evt3', 'School Supply Drive', 'Service', '2026-10-20', 'All Day', 'School Lobby', 'Community service project collecting supplies for local families.', '2026-09-01T12:00:00'),
        ('evt4', 'Fall Regional Competition', 'Competition', '2026-11-15', 'All Day', 'TBD', 'Regional FBLA competition. Members compete in selected events.', '2026-09-01T12:00:00'),
        ('evt5', 'Holiday Social & Fundraiser', 'Social', '2026-12-10', '3:15 PM - 5:00 PM', 'Cafeteria', 'End-of-semester celebration with games, food, and fundraising.', '2026-09-01T12:00:00')
        ''')

    cursor.execute('SELECT COUNT(*) FROM gallery')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO gallery (id, title, imageUrl, caption, event, date, createdAt) VALUES 
        ('gal1', 'State Leadership Conference 2026', 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600', 'Our chapter at the State Leadership Conference', 'SLC 2026', '2026-04-15', '2026-04-16T12:00:00'),
        ('gal2', 'Community Service Day', 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600', 'Members volunteering at the local food bank', 'Community Service', '2026-03-10', '2026-03-11T12:00:00'),
        ('gal3', 'Chapter Meeting', 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600', 'Monthly chapter meeting in progress', 'Chapter Meeting', '2026-02-05', '2026-02-06T12:00:00')
        ''')

    cursor.execute('SELECT COUNT(*) FROM resources')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO resources (id, title, url, category, description, createdAt) VALUES 
        ('res1', 'FBLA-ML Competitive Events Guide', 'https://www.fbla.org/divisions/fbla-middle-level/fbla-ml-competitive-events/', 'Competition Prep', 'Official list and descriptions of all FBLA Middle Level competitive events.', '2026-08-01T12:00:00'),
        ('res2', 'FBLA-ML Handbook', 'https://www.fbla.org/divisions/fbla-middle-level/', 'Handbook', 'Official FBLA Middle Level handbook with rules, guidelines, and resources.', '2026-08-01T12:00:00'),
        ('res3', 'Business Communication Study Guide', '#', 'Study Guide', 'Study materials for the Business Communication competitive event.', '2026-08-01T12:00:00'),
        ('res4', 'FBLA Creed & Pledge', 'https://www.fbla.org/about/', 'General', 'The official FBLA-PBL Creed and Pledge that members should memorize.', '2026-08-01T12:00:00')
        ''')

    cursor.execute('SELECT COUNT(*) FROM election_settings')
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO election_settings (key, value) VALUES ('enabled', 'true')")
        cursor.execute("INSERT INTO election_settings (key, value) VALUES ('title', '2026-2027 Officer Elections')")
        cursor.execute("INSERT INTO election_settings (key, value) VALUES ('schoolPayUrl', 'https://www.schoolpay.com')")
        cursor.execute("INSERT INTO election_settings (key, value) VALUES ('disabledPages', '[]')")

    cursor.execute('SELECT COUNT(*) FROM motm_polls')
    if cursor.fetchone()[0] == 0:
        nominees_json = json.dumps([
            {"id": "nom1", "name": "Emma Thompson", "grade": "7th", "reason": "Outstanding help organizing chapter dues and welcoming 6th graders.", "votes": 14},
            {"id": "nom2", "name": "Noah Kim", "grade": "6th", "reason": "Created great graphics for our school supply drive flyers.", "votes": 9},
            {"id": "nom3", "name": "Lucas Miller", "grade": "8th", "reason": "Mentored 3 new members in Business Communication prep.", "votes": 12}
        ])
        cursor.execute("INSERT INTO motm_polls (id, enabled, title, nominees) VALUES ('p1', 1, 'Vote for September Member of the Month 🌟', ?)", (nominees_json,))

    cursor.execute('SELECT COUNT(*) FROM motm_winners')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''INSERT INTO motm_winners (id, name, month, grade, photoUrl, reason, createdAt) VALUES 
        ('w1', 'Emma Thompson', 'September 2026', '7th Grade', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500', 'Recognized for exemplary leadership in organizing chapter dues and mentoring new 6th grade members!', '2026-09-01T12:00:00'),
        ('w2', 'Jordan Chen', 'August 2026', '8th Grade', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500', 'Recognized for leading the back-to-school FBLA recruitment drive and setting up chapter calendar.', '2026-08-01T12:00:00')
        ''')

    conn.commit()
    conn.close()

# Auth Routes
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    password = data.get('password', '')
    if check_password_hash(ADMIN_PASSWORD_HASH, password):
        session['logged_in'] = True
        return jsonify({'success': True})
    return jsonify({'success': False}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth', methods=['GET'])
def check_auth():
    return jsonify({'authenticated': session.get('logged_in', False)})

# Resend Admin Invitation Route
@app.route('/api/invite-admin', methods=['POST'])
@login_required
def invite_admin():
    data = request.json or {}
    recipient_email = data.get('email', '').strip()
    if not recipient_email:
        return jsonify({'error': 'Email address is required'}), 400

    html_content = f"""
    <div style="font-family: Arial, sans-serif; background-color: #071c36; color: #ffffff; padding: 30px; border-radius: 10px;">
      <h2 style="color: #e8b84b; margin-top: 0;">📊 LMMS FBLA Admin Access Invitation</h2>
      <p>Hello!</p>
      <p>You have been invited as an officer/advisor admin for the <strong>Little Mill Middle School FBLA</strong> chapter website.</p>
      <div style="background-color: #092541; padding: 20px; border-radius: 8px; border: 1px solid #e8b84b; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Admin URL:</strong> <a href="https://fbla-p1lc.onrender.com/#admin" style="color: #e8b84b;">https://fbla-p1lc.onrender.com/#admin</a></p>
        <p style="margin: 0;"><strong>Password:</strong> <code style="background: #133d6b; padding: 4px 8px; border-radius: 4px; color: #ffffff;">SERVICE</code></p>
      </div>
      <p>Using this password, you can edit announcements, meeting minutes, roster dues, election candidates, member of the month polls, and gallery items.</p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />
      <p style="font-size: 0.85em; color: #a0aec0;">Little Mill Middle School • Future Business Leaders of America</p>
    </div>
    """

    payload = {
        "from": "LMMS FBLA Chapter <onboarding@resend.dev>",
        "to": [recipient_email],
        "subject": "Admin Invitation — Little Mill Middle School FBLA Website",
        "html": html_content
    }

    api_key = RESEND_API_KEY or data.get('apiKey', '') or os.environ.get('RESEND_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'RESEND_API_KEY environment variable not set on server.'}), 400

    try:
        req = urllib.request.Request(
            'https://api.resend.com/emails',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            method='POST'
        )
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode('utf-8'))
            return jsonify({'success': True, 'resendId': res_data.get('id'), 'message': f'Invitation email sent to {recipient_email}!'})
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        try:
            err_json = json.loads(err_msg)
            message = err_json.get('message', 'Failed to send email via Resend API')
        except Exception:
            message = err_msg
        return jsonify({'error': message}), e.code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# SQLite Generic CRUD Route Factory
def create_crud_routes(table_name):
    @app.route(f'/api/{table_name}', methods=['GET'], endpoint=f'get_{table_name}')
    def get_resource():
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(f'SELECT * FROM {table_name} ORDER BY createdAt DESC')
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()

        # Parse JSON fields if needed
        for row in rows:
            if 'pinned' in row:
                row['pinned'] = bool(row['pinned'])
            if 'duesPaid' in row:
                row['duesPaid'] = bool(row['duesPaid'])
            if 'agendaItems' in row and row['agendaItems']:
                try:
                    row['agendaItems'] = json.loads(row['agendaItems'])
                except Exception:
                    pass
        return jsonify(rows)

    @app.route(f'/api/{table_name}', methods=['POST'], endpoint=f'create_{table_name}')
    @login_required
    def create_resource():
        new_item = request.json or {}
        item_id = generate_id()
        created_at = datetime.datetime.now().isoformat()
        new_item['id'] = item_id
        new_item['createdAt'] = created_at

        conn = get_db()
        cursor = conn.cursor()

        if table_name == 'announcements':
            cursor.execute('INSERT INTO announcements VALUES (?, ?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('title',''), new_item.get('content',''), new_item.get('category','General'), new_item.get('date',''), 1 if new_item.get('pinned') else 0, created_at))
        elif table_name == 'minutes':
            agenda_json = json.dumps(new_item.get('agendaItems', []))
            cursor.execute('INSERT INTO minutes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('title',''), new_item.get('date',''), new_item.get('calledToOrder',''), new_item.get('adjournedAt',''), str(new_item.get('attendance','')), new_item.get('advisor',''), new_item.get('recorder',''), new_item.get('googleDocUrl',''), agenda_json, created_at))
        elif table_name == 'roster':
            cursor.execute('INSERT INTO roster VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('name',''), new_item.get('grade','6th'), new_item.get('role','member'), new_item.get('officerTitle',''), new_item.get('email',''), 1 if new_item.get('duesPaid') else 0, created_at))
        elif table_name == 'events':
            cursor.execute('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('title',''), new_item.get('category','Meeting'), new_item.get('date',''), new_item.get('time',''), new_item.get('location',''), new_item.get('description',''), created_at))
        elif table_name == 'gallery':
            cursor.execute('INSERT INTO gallery VALUES (?, ?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('title',''), new_item.get('imageUrl',''), new_item.get('caption',''), new_item.get('event',''), new_item.get('date',''), created_at))
        elif table_name == 'resources':
            cursor.execute('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?)',
                           (item_id, new_item.get('title',''), new_item.get('url',''), new_item.get('category','General'), new_item.get('description',''), created_at))

        conn.commit()
        conn.close()
        return jsonify(new_item), 201

    @app.route(f'/api/{table_name}/<item_id>', methods=['PUT'], endpoint=f'update_{table_name}')
    @login_required
    def update_resource(item_id):
        update_data = request.json or {}
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(f'SELECT * FROM {table_name} WHERE id = ?', (item_id,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            return jsonify({'error': 'Not found'}), 404

        existing_dict = dict(existing)
        existing_dict.update(update_data)

        if table_name == 'announcements':
            cursor.execute('UPDATE announcements SET title=?, content=?, category=?, date=?, pinned=? WHERE id=?',
                           (existing_dict.get('title'), existing_dict.get('content'), existing_dict.get('category'), existing_dict.get('date'), 1 if existing_dict.get('pinned') else 0, item_id))
        elif table_name == 'minutes':
            agenda_val = existing_dict.get('agendaItems', [])
            agenda_json = json.dumps(agenda_val) if isinstance(agenda_val, (list, dict)) else str(agenda_val)
            cursor.execute('UPDATE minutes SET title=?, date=?, calledToOrder=?, adjournedAt=?, attendance=?, advisor=?, recorder=?, googleDocUrl=?, agendaItems=? WHERE id=?',
                           (existing_dict.get('title'), existing_dict.get('date'), existing_dict.get('calledToOrder'), existing_dict.get('adjournedAt'), str(existing_dict.get('attendance')), existing_dict.get('advisor'), existing_dict.get('recorder'), existing_dict.get('googleDocUrl'), agenda_json, item_id))
        elif table_name == 'roster':
            cursor.execute('UPDATE roster SET name=?, grade=?, role=?, officerTitle=?, email=?, duesPaid=? WHERE id=?',
                           (existing_dict.get('name'), existing_dict.get('grade'), existing_dict.get('role'), existing_dict.get('officerTitle'), existing_dict.get('email'), 1 if existing_dict.get('duesPaid') else 0, item_id))
        elif table_name == 'events':
            cursor.execute('UPDATE events SET title=?, category=?, date=?, time=?, location=?, description=? WHERE id=?',
                           (existing_dict.get('title'), existing_dict.get('category'), existing_dict.get('date'), existing_dict.get('time'), existing_dict.get('location'), existing_dict.get('description'), item_id))
        elif table_name == 'gallery':
            cursor.execute('UPDATE gallery SET title=?, imageUrl=?, caption=?, event=?, date=? WHERE id=?',
                           (existing_dict.get('title'), existing_dict.get('imageUrl'), existing_dict.get('caption'), existing_dict.get('event'), existing_dict.get('date'), item_id))
        elif table_name == 'resources':
            cursor.execute('UPDATE resources SET title=?, url=?, category=?, description=? WHERE id=?',
                           (existing_dict.get('title'), existing_dict.get('url'), existing_dict.get('category'), existing_dict.get('description'), item_id))

        conn.commit()
        conn.close()
        return jsonify(existing_dict)

    @app.route(f'/api/{table_name}/<item_id>', methods=['DELETE'], endpoint=f'delete_{table_name}')
    @login_required
    def delete_resource(item_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(f'DELETE FROM {table_name} WHERE id = ?', (item_id,))
        deleted = cursor.rowcount
        conn.commit()
        conn.close()

        if deleted == 0:
            return jsonify({'error': 'Not found'}), 404
        return jsonify({'success': True})

RESOURCES = ['announcements', 'minutes', 'roster', 'events', 'gallery', 'resources']
for resource in RESOURCES:
    create_crud_routes(resource)

# Special Candidate Routes (SQLite)
@app.route('/api/candidates', methods=['GET'])
def get_candidates():
    conn = get_db()
    cursor = conn.cursor()
    is_admin = session.get('logged_in', False)
    if is_admin:
        cursor.execute('SELECT * FROM candidates ORDER BY createdAt DESC')
    else:
        cursor.execute("SELECT * FROM candidates WHERE status = 'approved' ORDER BY createdAt DESC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/candidates/apply', methods=['POST'])
def apply_candidate():
    data = request.json or {}
    item_id = generate_id()
    created_at = datetime.datetime.now().isoformat()
    new_candidate = {
        'id': item_id,
        'name': data.get('name', ''),
        'grade': data.get('grade', '7th'),
        'targetRole': data.get('targetRole', 'President'),
        'statement': data.get('statement', ''),
        'qualifications': data.get('qualifications', ''),
        'status': 'pending',
        'createdAt': created_at
    }

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO candidates VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                   (item_id, new_candidate['name'], new_candidate['grade'], new_candidate['targetRole'], new_candidate['statement'], new_candidate['qualifications'], 'pending', created_at))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Application submitted for officer review!', 'candidate': new_candidate}), 201

@app.route('/api/candidates/<item_id>', methods=['PUT'])
@login_required
def update_candidate(item_id):
    update_data = request.json or {}
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM candidates WHERE id = ?', (item_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Not found'}), 404

    candidate = dict(existing)
    candidate.update(update_data)
    cursor.execute('UPDATE candidates SET name=?, grade=?, targetRole=?, statement=?, qualifications=?, status=? WHERE id=?',
                   (candidate['name'], candidate['grade'], candidate['targetRole'], candidate['statement'], candidate['qualifications'], candidate['status'], item_id))
    conn.commit()
    conn.close()
    return jsonify(candidate)

@app.route('/api/candidates/<item_id>', methods=['DELETE'])
@login_required
def delete_candidate(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM candidates WHERE id = ?', (item_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    if deleted == 0:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'success': True})

# Member of the Month (MOTM) Routes (SQLite)
@app.route('/api/motm', methods=['GET'])
def get_motm():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM motm_polls ORDER BY id LIMIT 1')
    poll_row = cursor.fetchone()
    poll = {}
    if poll_row:
        poll_dict = dict(poll_row)
        try:
            nominees = json.loads(poll_dict.get('nominees', '[]'))
        except Exception:
            nominees = []
        poll = {
            'enabled': bool(poll_dict.get('enabled')),
            'title': poll_dict.get('title'),
            'nominees': nominees
        }

    cursor.execute('SELECT * FROM motm_winners ORDER BY createdAt DESC')
    winners = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'activePoll': poll, 'winners': winners})

@app.route('/api/motm/vote', methods=['POST'])
def vote_motm():
    data = request.json or {}
    candidate_id = data.get('candidateId')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM motm_polls ORDER BY id LIMIT 1')
    poll_row = cursor.fetchone()
    if not poll_row:
        conn.close()
        return jsonify({'error': 'MOTM voting is currently closed'}), 400

    poll_dict = dict(poll_row)
    if not poll_dict.get('enabled'):
        conn.close()
        return jsonify({'error': 'MOTM voting is currently closed'}), 400

    try:
        nominees = json.loads(poll_dict.get('nominees', '[]'))
    except Exception:
        nominees = []

    voted_name = ''
    found = False
    for nom in nominees:
        if nom.get('id') == candidate_id:
            nom['votes'] = nom.get('votes', 0) + 1
            voted_name = nom.get('name')
            found = True
            break

    if not found:
        conn.close()
        return jsonify({'error': 'Candidate not found'}), 404

    cursor.execute('UPDATE motm_polls SET nominees = ? WHERE id = ?', (json.dumps(nominees), poll_dict['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': f'Vote recorded for {voted_name}!'})

@app.route('/api/motm/poll', methods=['POST'])
@login_required
def save_motm_poll():
    data = request.json or {}
    enabled = 1 if data.get('enabled', True) else 0
    title = data.get('title', 'Vote for Member of the Month')
    nominees_json = json.dumps(data.get('nominees', []))

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM motm_polls')
    cursor.execute('INSERT INTO motm_polls (id, enabled, title, nominees) VALUES (?, ?, ?, ?)',
                   ('p1', enabled, title, nominees_json))
    conn.commit()
    conn.close()
    return jsonify({'enabled': bool(enabled), 'title': title, 'nominees': data.get('nominees', [])})

@app.route('/api/motm/winner', methods=['POST'])
@login_required
def add_motm_winner():
    data = request.json or {}
    item_id = generate_id()
    created_at = datetime.datetime.now().isoformat()
    new_winner = {
        'id': item_id,
        'name': data.get('name', ''),
        'month': data.get('month', ''),
        'grade': data.get('grade', ''),
        'photoUrl': data.get('photoUrl', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500'),
        'reason': data.get('reason', ''),
        'createdAt': created_at
    }

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO motm_winners VALUES (?, ?, ?, ?, ?, ?, ?)',
                   (item_id, new_winner['name'], new_winner['month'], new_winner['grade'], new_winner['photoUrl'], new_winner['reason'], created_at))
    conn.commit()
    conn.close()
    return jsonify(new_winner), 201

@app.route('/api/motm/winner/<item_id>', methods=['DELETE'])
@login_required
def delete_motm_winner(item_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM motm_winners WHERE id = ?', (item_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    if deleted == 0:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'success': True})

# Election & Site Settings Routes (SQLite)
@app.route('/api/election-settings', methods=['GET'])
def get_election_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM election_settings')
    rows = cursor.fetchall()
    conn.close()

    settings = {
        'enabled': True,
        'title': '2026-2027 Officer Elections',
        'schoolPayUrl': 'https://www.schoolpay.com',
        'disabledPages': []
    }

    for row in rows:
        key, val = row['key'], row['value']
        if key == 'enabled':
            settings['enabled'] = val.lower() == 'true'
        elif key == 'disabledPages':
            try:
                settings['disabledPages'] = json.loads(val)
            except Exception:
                settings['disabledPages'] = []
        else:
            settings[key] = val

    return jsonify(settings)

@app.route('/api/election-settings', methods=['POST'])
@login_required
def update_election_settings():
    new_settings = request.json or {}
    conn = get_db()
    cursor = conn.cursor()

    for key, val in new_settings.items():
        if isinstance(val, (dict, list)):
            val_str = json.dumps(val)
        elif isinstance(val, bool):
            val_str = 'true' if val else 'false'
        else:
            val_str = str(val)

        cursor.execute('INSERT OR REPLACE INTO election_settings (key, value) VALUES (?, ?)', (key, val_str))

    conn.commit()
    conn.close()
    return get_election_settings()

# Catch-all route
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return render_template('index.html')

# Run database initialization before starting
init_db()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
