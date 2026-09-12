import os
import json
import uuid
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
ADMIN_PASSWORD_HASH = generate_password_hash('SERVICE')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')

# Helper Functions
def load_data(filename):
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        if filename == 'election_settings.json':
            return {"enabled": True, "title": "2026-2027 Officer Elections", "schoolPayUrl": "https://www.schoolpay.com"}
        elif filename == 'motm.json':
            return {"activePoll": {"enabled": True, "title": "Vote for September Member of the Month", "nominees": []}, "winners": []}
        return []
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError:
        if filename == 'election_settings.json':
            return {"enabled": True, "title": "2026-2027 Officer Elections", "schoolPayUrl": "https://www.schoolpay.com"}
        elif filename == 'motm.json':
            return {"activePoll": {"enabled": True, "title": "Vote for September Member of the Month", "nominees": []}, "winners": []}
        return []

def save_data(filename, data):
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

def generate_id():
    return str(uuid.uuid4())[:8]

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
        <p style="margin: 0 0 10px 0;"><strong>Admin URL:</strong> <a href="http://localhost:5000/#admin" style="color: #e8b84b;">http://localhost:5000/#admin</a></p>
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
                'Content-Type': 'application/json'
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

# Helper to create CRUD routes for standard resources
def create_crud_routes(resource_name):
    @app.route(f'/api/{resource_name}', methods=['GET'], endpoint=f'get_{resource_name}')
    def get_resource():
        data = load_data(f'{resource_name}.json')
        if isinstance(data, list):
            data.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return jsonify(data)

    @app.route(f'/api/{resource_name}', methods=['POST'], endpoint=f'create_{resource_name}')
    @login_required
    def create_resource():
        data = load_data(f'{resource_name}.json')
        new_item = request.json or {}
        new_item['id'] = generate_id()
        new_item['createdAt'] = datetime.datetime.now().isoformat()
        if isinstance(data, list):
            data.append(new_item)
            save_data(f'{resource_name}.json', data)
        return jsonify(new_item), 201

    @app.route(f'/api/{resource_name}/<item_id>', methods=['PUT'], endpoint=f'update_{resource_name}')
    @login_required
    def update_resource(item_id):
        data = load_data(f'{resource_name}.json')
        update_data = request.json or {}
        if isinstance(data, list):
            for i, item in enumerate(data):
                if item.get('id') == item_id:
                    original_id = item.get('id')
                    original_created = item.get('createdAt')
                    item.update(update_data)
                    item['id'] = original_id
                    item['createdAt'] = original_created
                    save_data(f'{resource_name}.json', data)
                    return jsonify(item)
        return jsonify({'error': 'Not found'}), 404

    @app.route(f'/api/{resource_name}/<item_id>', methods=['DELETE'], endpoint=f'delete_{resource_name}')
    @login_required
    def delete_resource(item_id):
        data = load_data(f'{resource_name}.json')
        if isinstance(data, list):
            new_data = [item for item in data if item.get('id') != item_id]
            if len(new_data) == len(data):
                return jsonify({'error': 'Not found'}), 404
            save_data(f'{resource_name}.json', new_data)
            return jsonify({'success': True})
        return jsonify({'error': 'Not found'}), 404

RESOURCES = ['announcements', 'minutes', 'roster', 'events', 'gallery', 'resources']
for resource in RESOURCES:
    create_crud_routes(resource)

# Special Candidate Routes
@app.route('/api/candidates', methods=['GET'])
def get_candidates():
    candidates = load_data('candidates.json')
    is_admin = session.get('logged_in', False)
    if not is_admin:
        candidates = [c for c in candidates if c.get('status') == 'approved']
    candidates.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
    return jsonify(candidates)

@app.route('/api/candidates/apply', methods=['POST'])
def apply_candidate():
    data = request.json or {}
    new_candidate = {
        'id': generate_id(),
        'name': data.get('name', ''),
        'grade': data.get('grade', '7th'),
        'targetRole': data.get('targetRole', 'President'),
        'statement': data.get('statement', ''),
        'qualifications': data.get('qualifications', ''),
        'status': 'pending',
        'createdAt': datetime.datetime.now().isoformat()
    }
    candidates = load_data('candidates.json')
    candidates.append(new_candidate)
    save_data('candidates.json', candidates)
    return jsonify({'success': True, 'message': 'Application submitted for officer review!', 'candidate': new_candidate}), 201

@app.route('/api/candidates/<item_id>', methods=['PUT'])
@login_required
def update_candidate(item_id):
    candidates = load_data('candidates.json')
    update_data = request.json or {}
    for candidate in candidates:
        if candidate.get('id') == item_id:
            original_id = candidate.get('id')
            original_created = candidate.get('createdAt')
            candidate.update(update_data)
            candidate['id'] = original_id
            candidate['createdAt'] = original_created
            save_data('candidates.json', candidates)
            return jsonify(candidate)
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/candidates/<item_id>', methods=['DELETE'])
@login_required
def delete_candidate(item_id):
    candidates = load_data('candidates.json')
    new_candidates = [c for c in candidates if c.get('id') != item_id]
    if len(new_candidates) == len(candidates):
        return jsonify({'error': 'Not found'}), 404
    save_data('candidates.json', new_candidates)
    return jsonify({'success': True})

# Member of the Month (MOTM) Routes
@app.route('/api/motm', methods=['GET'])
def get_motm():
    motm_data = load_data('motm.json')
    is_admin = session.get('logged_in', False)
    
    # Hide raw vote numbers from non-admins if desired, or show
    output = {
        'activePoll': motm_data.get('activePoll', {}),
        'winners': motm_data.get('winners', [])
    }
    return jsonify(output)

@app.route('/api/motm/vote', methods=['POST'])
def vote_motm():
    data = request.json or {}
    candidate_id = data.get('candidateId')
    motm_data = load_data('motm.json')
    poll = motm_data.get('activePoll', {})
    
    if not poll.get('enabled', False):
        return jsonify({'error': 'MOTM voting is currently closed'}), 400
        
    for nom in poll.get('nominees', []):
        if nom.get('id') == candidate_id:
            nom['votes'] = nom.get('votes', 0) + 1
            save_data('motm.json', motm_data)
            return jsonify({'success': True, 'message': f'Vote recorded for {nom.get("name")}!'})
            
    return jsonify({'error': 'Candidate not found'}), 404

@app.route('/api/motm/poll', methods=['POST'])
@login_required
def save_motm_poll():
    data = request.json or {}
    motm_data = load_data('motm.json')
    motm_data['activePoll'] = {
        'enabled': data.get('enabled', True),
        'title': data.get('title', 'Vote for Member of the Month'),
        'nominees': data.get('nominees', [])
    }
    save_data('motm.json', motm_data)
    return jsonify(motm_data['activePoll'])

@app.route('/api/motm/winner', methods=['POST'])
@login_required
def add_motm_winner():
    data = request.json or {}
    motm_data = load_data('motm.json')
    new_winner = {
        'id': generate_id(),
        'name': data.get('name', ''),
        'month': data.get('month', ''),
        'grade': data.get('grade', ''),
        'photoUrl': data.get('photoUrl', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500'),
        'reason': data.get('reason', ''),
        'createdAt': datetime.datetime.now().isoformat()
    }
    motm_data.setdefault('winners', []).append(new_winner)
    save_data('motm.json', motm_data)
    return jsonify(new_winner), 201

@app.route('/api/motm/winner/<item_id>', methods=['DELETE'])
@login_required
def delete_motm_winner(item_id):
    motm_data = load_data('motm.json')
    winners = motm_data.get('winners', [])
    new_winners = [w for w in winners if w.get('id') != item_id]
    if len(new_winners) == len(winners):
        return jsonify({'error': 'Not found'}), 404
    motm_data['winners'] = new_winners
    save_data('motm.json', motm_data)
    return jsonify({'success': True})

# Election Settings Routes
@app.route('/api/election-settings', methods=['GET'])
def get_election_settings():
    settings = load_data('election_settings.json')
    return jsonify(settings)

@app.route('/api/election-settings', methods=['POST'])
@login_required
def update_election_settings():
    new_settings = request.json or {}
    settings = load_data('election_settings.json')
    if isinstance(settings, dict):
        settings.update(new_settings)
    else:
        settings = new_settings
    save_data('election_settings.json', settings)
    return jsonify(settings)

# Catch-all route
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return render_template('index.html')

# Startup and Seed Data
SEED_DATA = {
    'announcements.json': [
        {"id":"ann1","title":"Welcome Back! First FBLA Meeting of the Year","content":"Welcome to another exciting year of FBLA at Little Mill Middle School! Our first meeting will be held on Wednesday, September 16th in Room 204 after school. All interested students are welcome to attend. We'll be discussing this year's goals, upcoming competitions, and community service projects.","category":"Important","date":"2026-09-08","pinned":True,"createdAt":"2026-09-08T12:00:00"},
        {"id":"ann2","title":"Membership Dues Reminder — Pay via SchoolPay","content":"FBLA membership dues for the 2026-2027 school year are $15. Please submit your dues via SchoolPay or to Mrs. Johnson by September 30th. Dues cover your national and state membership, competition fees, and chapter activities.","category":"Dues","date":"2026-09-05","pinned":False,"createdAt":"2026-09-05T12:00:00"},
        {"id":"ann3","title":"Fall Regional Competition Registration Open","content":"Registration is now open for the Fall Regional FBLA Competition. Interested members should sign up by October 15th. See the Events section for more details on available competitive events.","category":"Competition","date":"2026-09-01","pinned":False,"createdAt":"2026-09-01T12:00:00"}
    ],
    'minutes.json': [
        {"id":"min1","title":"First Meeting of 2026-2027","date":"2026-09-16","calledToOrder":"3:15 PM","adjournedAt":"4:00 PM","attendance":"42 members present","advisor":"Mrs. Johnson","agendaItems":[{"title":"Welcome & Introductions","description":"Officers introduced themselves and welcomed new members to the chapter."},{"title":"Overview of FBLA","description":"Advisor presented an overview of FBLA-ML, its mission, and the benefits of membership."},{"title":"Membership Dues","description":"Dues are $15, due by September 30th. Payment can be made online via SchoolPay."},{"title":"Competition Preview","description":"Vice President discussed available competitive events for the 2026-2027 season."},{"title":"Community Service","description":"The chapter will organize a school supply drive in October."},{"title":"Next Meeting","description":"October 7th, 2026 at 3:15 PM in Room 204."}],"recorder":"Secretary","createdAt":"2026-09-16T16:00:00"}
    ],
    'roster.json': [
        {"id":"ros1","name":"Alex Rivera","grade":"8th","role":"officer","officerTitle":"President","email":"","duesPaid":True,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros2","name":"Jordan Chen","grade":"8th","role":"officer","officerTitle":"Vice President","email":"","duesPaid":True,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros3","name":"Mia Patel","grade":"7th","role":"officer","officerTitle":"Secretary","email":"","duesPaid":True,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros4","name":"Ethan Brooks","grade":"8th","role":"officer","officerTitle":"Treasurer","email":"","duesPaid":True,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros5","name":"Sofia Martinez","grade":"7th","role":"officer","officerTitle":"Reporter","email":"","duesPaid":True,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros6","name":"Liam Washington","grade":"8th","role":"officer","officerTitle":"Parliamentarian","email":"","duesPaid":False,"createdAt":"2026-08-01T12:00:00"},
        {"id":"ros7","name":"Emma Thompson","grade":"7th","role":"member","officerTitle":"","email":"","duesPaid":True,"createdAt":"2026-08-15T12:00:00"},
        {"id":"ros8","name":"Noah Kim","grade":"6th","role":"member","officerTitle":"","email":"","duesPaid":False,"createdAt":"2026-08-15T12:00:00"}
    ],
    'events.json': [
        {"id":"evt1","title":"First Chapter Meeting","date":"2026-09-16","time":"3:15 PM - 4:00 PM","location":"Room 204","description":"Welcome meeting for all new and returning members.","category":"Meeting","createdAt":"2026-09-01T12:00:00"},
        {"id":"evt2","title":"October Chapter Meeting","date":"2026-10-07","time":"3:15 PM - 4:00 PM","location":"Room 204","description":"Competition event selection and community service planning.","category":"Meeting","createdAt":"2026-09-01T12:00:00"},
        {"id":"evt3","title":"School Supply Drive","date":"2026-10-20","time":"All Day","location":"School Lobby","description":"Community service project collecting supplies for local families.","category":"Service","createdAt":"2026-09-01T12:00:00"},
        {"id":"evt4","title":"Fall Regional Competition","date":"2026-11-15","time":"All Day","location":"TBD","description":"Regional FBLA competition. Members compete in selected events.","category":"Competition","createdAt":"2026-09-01T12:00:00"},
        {"id":"evt5","title":"Holiday Social & Fundraiser","date":"2026-12-10","time":"3:15 PM - 5:00 PM","location":"Cafeteria","description":"End-of-semester celebration with games, food, and fundraising.","category":"Social","createdAt":"2026-09-01T12:00:00"}
    ],
    'gallery.json': [
        {"id":"gal1","title":"State Leadership Conference 2026","imageUrl":"https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600","caption":"Our chapter at the State Leadership Conference","event":"SLC 2026","date":"2026-04-15","createdAt":"2026-04-16T12:00:00"},
        {"id":"gal2","title":"Community Service Day","imageUrl":"https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600","caption":"Members volunteering at the local food bank","event":"Community Service","date":"2026-03-10","createdAt":"2026-03-11T12:00:00"},
        {"id":"gal3","title":"Chapter Meeting","imageUrl":"https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600","caption":"Monthly chapter meeting in progress","event":"Chapter Meeting","date":"2026-02-05","createdAt":"2026-02-06T12:00:00"}
    ],
    'resources.json': [
        {"id":"res1","title":"FBLA-ML Competitive Events Guide","url":"https://www.fbla.org/divisions/fbla-middle-level/fbla-ml-competitive-events/","description":"Official list and descriptions of all FBLA Middle Level competitive events.","category":"Competition Prep","createdAt":"2026-08-01T12:00:00"},
        {"id":"res2","title":"FBLA-ML Handbook","url":"https://www.fbla.org/divisions/fbla-middle-level/","description":"Official FBLA Middle Level handbook with rules, guidelines, and resources.","category":"Handbook","createdAt":"2026-08-01T12:00:00"},
        {"id":"res3","title":"Business Communication Study Guide","url":"#","description":"Study materials for the Business Communication competitive event.","category":"Study Guide","createdAt":"2026-08-01T12:00:00"},
        {"id":"res4","title":"FBLA Creed & Pledge","url":"https://www.fbla.org/about/","description":"The official FBLA-PBL Creed and Pledge that members should memorize.","category":"General","createdAt":"2026-08-01T12:00:00"}
    ],
    'candidates.json': [
        {"id":"cand1","name":"Samantha Vance","grade":"8th","targetRole":"President","statement":"I want to help our chapter win top awards at State and organize fun community service events!","qualifications":"Served as Chapter Vice President last year and won 1st place in Business Communication.","status":"approved","createdAt":"2026-09-02T10:00:00"},
        {"id":"cand2","name":"Marcus Davis","grade":"7th","targetRole":"Vice President","statement":"I will assist all members with competition prep and lead workshops on digital citizenship.","qualifications":"FBLA member for 2 years, active in school robotics club.","status":"approved","createdAt":"2026-09-03T11:00:00"},
        {"id":"cand3","name":"Olivia Taylor","grade":"7th","targetRole":"Secretary","statement":"I am organized, reliable, and will keep our meeting minutes and records pristine.","qualifications":"Honor roll student, organized homeroom drives.","status":"approved","createdAt":"2026-09-04T09:00:00"}
    ],
    'election_settings.json': {
        "enabled": True,
        "title": "2026-2027 Officer Elections",
        "schoolPayUrl": "https://www.schoolpay.com"
    },
    'motm.json': {
        "activePoll": {
            "enabled": True,
            "title": "Vote for September Member of the Month 🌟",
            "nominees": [
                {"id": "nom1", "name": "Emma Thompson", "grade": "7th", "reason": "Outstanding help organizing chapter dues and welcoming 6th graders.", "votes": 14},
                {"id": "nom2", "name": "Noah Kim", "grade": "6th", "reason": "Created great graphics for our school supply drive flyers.", "votes": 9},
                {"id": "nom3", "name": "Lucas Miller", "grade": "8th", "reason": "Mentored 3 new members in Business Communication prep.", "votes": 12}
            ]
        },
        "winners": [
            {
                "id": "w1",
                "name": "Emma Thompson",
                "month": "September 2026",
                "grade": "7th Grade",
                "photoUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
                "reason": "Recognized for exemplary leadership in organizing chapter dues and mentoring new 6th grade members!"
            },
            {
                "id": "w2",
                "name": "Jordan Chen",
                "month": "August 2026",
                "grade": "8th Grade",
                "photoUrl": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500",
                "reason": "Recognized for leading the back-to-school FBLA recruitment drive and setting up chapter calendar."
            }
        ]
    }
}

def init_app():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    for filename, initial_data in SEED_DATA.items():
        filepath = os.path.join(DATA_DIR, filename)
        if not os.path.exists(filepath):
            with open(filepath, 'w') as f:
                json.dump(initial_data, f, indent=2)

# Run initialization before starting
init_app()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
