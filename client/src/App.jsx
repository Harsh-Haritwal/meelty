import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { io } from 'socket.io-client';
import { AudioLines, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleHelp, Copy, DoorOpen, Headphones, Link2, Mic, MicOff, MonitorUp, MoreHorizontal, Plus, Settings2, ShieldCheck, Sparkles, Video, VideoOff, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const initialMeetings = [
  { title: 'Design sync', date: 'Today · 2:30 PM', color: 'lavender', initials: 'DS', code: 'DESIGN-24' },
  { title: 'Weekly team standup', date: 'Tomorrow · 9:00 AM', color: 'peach', initials: 'WT', code: 'TEAM-101' },
  { title: 'Project catch-up', date: 'Fri, Oct 25 · 11:00 AM', color: 'mint', initials: 'PC', code: 'CATCH-UP' }
];

function App() {
  const [page, setPage] = useState('home'); const [name, setName] = useState(localStorage.getItem('meetly-name') || 'Alex Morgan');
  const [code, setCode] = useState(''); const [meeting, setMeeting] = useState(null); const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState(''); const [loading, setLoading] = useState(false); const [cameraOn, setCameraOn] = useState(true); const [micOn, setMicOn] = useState(true); const [screenSharing, setScreenSharing] = useState(false); const [localVideoStream, setLocalVideoStream] = useState(null);
  const [peers, setPeers] = useState([]); const [roomError, setRoomError] = useState(''); const [toast, setToast] = useState('');
  const socketRef = useRef(null); const streamRef = useRef(null); const peerRefs = useRef({}); const screenTrackRef = useRef(null);
  const notify = message => { setToast(message); setTimeout(() => setToast(''), 2600); };
  const startMeeting = async (joinCode) => {
    setJoinError(''); setLoading(true);
    try {
      const normalized = joinCode?.trim().toUpperCase();
      let data;
      if (!normalized) { const res = await fetch(`${API}/api/meetings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Quick catch-up' }) }); if (!res.ok) throw new Error('Could not create a meeting. Is the server running?'); data = await res.json(); }
      else { const res = await fetch(`${API}/api/meetings/${encodeURIComponent(normalized)}`); if (!res.ok) throw new Error('We couldn’t find that meeting code. Check it and try again.'); data = await res.json(); }
      localStorage.setItem('meetly-name', name); setMeeting(data); setPage('call'); setRoomError('');
    } catch (e) { setJoinError(e.message); setLoading(false); }
  };
  useEffect(() => {
    if (page !== 'call' || !meeting) return;
    let alive = true;
    const connect = async () => {
      try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
      catch { if (alive) { setCameraOn(false); setMicOn(false); } }
      if (!alive) return;
      const socket = io(API); socketRef.current = socket;
      socket.on('connect', () => socket.emit('room:join', { code: meeting.code, name: name || 'Guest' }));
      socket.on('room:error', ({ message }) => setRoomError(message));
      socket.on('room:joined', ({ peers: existing }) => { setPeers(existing.map(p => ({ ...p, stream: null }))); existing.forEach(p => makePeer(p.id, true, socket)); });
      socket.on('peer:joined', peer => { setPeers(prev => [...prev, { ...peer, stream: null }]); makePeer(peer.id, false, socket); });
      socket.on('peer:signal', ({ from, signal }) => { peerRefs.current[from]?.signal(signal); });
      socket.on('peer:left', ({ id }) => { peerRefs.current[id]?.destroy(); delete peerRefs.current[id]; setPeers(prev => prev.filter(p => p.id !== id)); });
    };
    const makePeer = (id, initiator, socket) => {
      const peer = new Peer({ initiator, trickle: false, stream: streamRef.current || undefined, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } });
      peer.on('signal', signal => socket.emit('peer:signal', { to: id, signal }));
      peer.on('stream', stream => setPeers(prev => prev.map(p => p.id === id ? { ...p, stream } : p)));
      peer.on('close', () => setPeers(prev => prev.filter(p => p.id !== id)));
      peerRefs.current[id] = peer;
    };
    connect();
    return () => { alive = false; Object.values(peerRefs.current).forEach(p => p.destroy()); peerRefs.current = {}; socketRef.current?.disconnect(); socketRef.current = null; screenTrackRef.current?.stop(); screenTrackRef.current = null; streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setLocalVideoStream(null); setScreenSharing(false); };
  }, [page, meeting]);
  useEffect(() => { if (streamRef.current) streamRef.current.getVideoTracks().forEach(t => t.enabled = cameraOn); }, [cameraOn]);
  useEffect(() => { if (streamRef.current) streamRef.current.getAudioTracks().forEach(t => t.enabled = micOn); }, [micOn]);
  const stopScreenShare = () => {
    const screenTrack = screenTrackRef.current; const cameraTrack = streamRef.current?.getVideoTracks()[0];
    if (!screenTrack) return;
    Object.values(peerRefs.current).forEach(peer => { try { peer.replaceTrack(screenTrack, cameraTrack, streamRef.current); } catch {} });
    screenTrack.onended = null; screenTrack.stop(); screenTrackRef.current = null;
    setLocalVideoStream(streamRef.current ? new MediaStream(streamRef.current.getTracks()) : null); setScreenSharing(false);
  };
  const toggleScreenShare = async () => {
    if (screenSharing) return stopScreenShare();
    if (!navigator.mediaDevices?.getDisplayMedia) return notify('Screen sharing is not available in this browser.');
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false });
      const track = display.getVideoTracks()[0]; if (!track) return;
      screenTrackRef.current = track;
      const cameraTrack = streamRef.current?.getVideoTracks()[0];
      Object.values(peerRefs.current).forEach(peer => { if (cameraTrack) peer.replaceTrack(cameraTrack, track, streamRef.current); });
      setLocalVideoStream(new MediaStream([...(streamRef.current?.getAudioTracks() || []), track])); setScreenSharing(true);
      track.onended = () => stopScreenShare();
    } catch (error) { if (error.name !== 'NotAllowedError') notify('Could not start screen sharing.'); }
  };
  const leave = () => { setPage('home'); setMeeting(null); setPeers([]); setRoomError(''); setLoading(false); };
  const copyCode = async value => { await navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1700); };
  const VideoTile = ({ stream, local, label, color = 'lavender' }) => {
    const ref = useRef(null); useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
    return <div className={`video-tile ${local ? 'local-tile' : ''}`}><video ref={ref} autoPlay playsInline muted={local} className={(local && !cameraOn) || (!stream && !local) ? 'hidden-video' : ''}/>{((local && !cameraOn) || (!stream && !local)) && <div className={`avatar avatar-${color}`}>{(label || '?').split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase()}</div>}<div className="tile-label"><span className={`mic-status ${local && !micOn ? 'muted' : ''}`}>{local && !micOn ? <MicOff size={13}/> : <Mic size={13}/>}</span>{label}{local && <span className="you-tag">You</span>}</div>{local && <span className="tile-more"><MoreHorizontal size={17}/></span>}</div>;
  };
  if (page === 'call' && meeting) return <main className="call-shell"><header className="call-header"><button className="brand" onClick={leave}><span className="brand-mark"><AudioLines size={18}/></span>meetly</button><div className="call-meta"><span className="live-dot"/> Live meeting <span className="meta-divider">·</span> <span>{meeting.code}</span></div><button className="icon-button call-help" title="Help"><CircleHelp size={18}/></button></header><section className="call-content"><div className="call-title-row"><div><div className="eyebrow"><span className="live-dot"/> NOW IN SESSION</div><h1>{meeting.title || 'Quick catch-up'}</h1><p>Share this code to bring someone into the room.</p></div><button className="share-button" onClick={() => copyCode(meeting.code)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy invite code'}</button></div>{roomError && <div className="error-banner"><X size={17}/>{roomError}<button onClick={leave}>Back to dashboard</button></div>}<div className="meeting-stage"><div className={`video-grid count-${Math.min(peers.length + 1, 10)}`}><VideoTile stream={localVideoStream || streamRef.current} local label={name}/>{peers.map((peer, i) => <VideoTile key={peer.id} stream={peer.stream} label={peer.name} color={['peach','mint','blue','pink'][i % 4]}/>)}</div><div className="participant-count"><span className="live-dot"/>{peers.length + 1} {peers.length === 0 ? 'person' : 'people'} <span>/ 10</span></div></div><div className="control-dock"><button className={`control-button ${!micOn ? 'off' : ''}`} onClick={() => setMicOn(!micOn)}>{micOn ? <Mic size={19}/> : <MicOff size={19}/>}<span>{micOn ? 'Mute' : 'Unmute'}</span></button><button className={`control-button ${!cameraOn ? 'off' : ''}`} onClick={() => setCameraOn(!cameraOn)}>{cameraOn ? <Video size={19}/> : <VideoOff size={19}/>}<span>{cameraOn ? 'Stop video' : 'Start video'}</span></button><button className={`control-button screen-share ${screenSharing ? 'off' : ''}`} onClick={toggleScreenShare}><MonitorUp size={19}/><span>{screenSharing ? 'Stop sharing' : 'Share screen'}</span></button><button className="leave-button" onClick={leave}><DoorOpen size={18}/><span>Leave meeting</span></button></div><p className="privacy-note"><ShieldCheck size={14}/> Your meeting is private and only people with the code can join.</p></section><Toast message={toast}/></main>;
  return <div className="app-shell"><aside className="sidebar"><button className="brand"><span className="brand-mark"><AudioLines size={18}/></span>meetly</button><div className="workspace-label">WORKSPACE <ChevronDown size={13}/></div><div className="workspace-row"><span className="workspace-avatar">A</span><div><strong>Alex’s workspace</strong><small>Free plan</small></div><MoreHorizontal size={18} className="workspace-more"/></div><nav className="side-nav"><button className="nav-item active"><span className="nav-symbol"><CalendarDays size={17}/></span> Meetings</button><button className="nav-item" onClick={() => notify('Your contacts will appear here')}><span className="nav-symbol"><Headphones size={17}/></span> Contacts</button><button className="nav-item" onClick={() => notify('Settings are coming soon')}><span className="nav-symbol"><Settings2 size={17}/></span> Settings</button></nav><div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16}/></div><strong>Make room for more</strong><p>Get longer meetings and more great features.</p><button onClick={() => notify('You’re already on the list!')}>Explore plans <ArrowUpRight size={14}/></button></div><button className="profile-row" onClick={() => { const n = prompt('What should we call you?', name); if (n) { setName(n); localStorage.setItem('meetly-name', n); } }}><span className="profile-avatar">{name.split(' ').map(n => n[0]).join('').slice(0,2)}</span><span><strong>{name}</strong><small>Personal account</small></span><MoreHorizontal size={18}/></button></div></aside><main className="dashboard"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Meetings</strong></div><button className="help-link" onClick={() => notify('Need help? hello@meetly.app')}><CircleHelp size={16}/> Help center</button></header><div className="dashboard-body"><div className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> YOUR SPACE TO CONNECT</div><h1>Good morning, {name.split(' ')[0]} <span className="wave">✳</span></h1><p>Bring your people together, wherever they are.</p></div><div className="date-pill"><CalendarDays size={15}/> Thursday, October 24</div></div><section className="hero-card"><div className="hero-copy"><span className="hero-kicker">A LITTLE CLOSER, A LOT MORE CONNECTED</span><h2>Good conversations<br/>start with <em>showing up.</em></h2><p>Make a room, invite your people, and get right into it. No fuss, just face time.</p><button className="primary-button" onClick={() => startMeeting()} disabled={loading}><Plus size={17}/>{loading ? 'Setting things up…' : 'Start an instant meeting'}<ArrowUpRight size={16}/></button><div className="hero-foot"><ShieldCheck size={14}/> Private by default <span>·</span> Up to 10 people</div></div><div className="hero-art"><div className="art-sun"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-star star-one">✳</div><div className="art-star star-two">✴</div><div className="art-person person-one"><span>J</span></div><div className="art-person person-two"><span>M</span></div><div className="art-person person-three"><span>A</span></div><div className="art-person person-four"><span>S</span></div><div className="art-chat"><span className="chat-dot"/><span className="chat-line"/><span className="chat-line short"/></div><div className="art-caption">the best kind of meeting <span>↗</span></div></div></section><div className="content-columns"><section className="join-card"><div className="section-heading"><div><h3>Join a meeting</h3><p>Have a code? You’re one step away.</p></div><span className="heading-icon"><Link2 size={17}/></span></div><form className="join-form" onSubmit={e => { e.preventDefault(); startMeeting(code); }}><label className="input-wrap"><Link2 size={16}/><input value={code} onChange={e => {setCode(e.target.value); setJoinError('');}} placeholder="Enter meeting code" aria-label="Meeting code"/><span className="code-hint">e.g. A1B2-C3D4</span></label><button className="join-button" disabled={loading || !code.trim()}>{loading ? 'Joining…' : 'Join room'}<ArrowUpRight size={15}/></button></form>{joinError && <div className="inline-error">{joinError}</div>}<div className="join-foot"><span className="secure-dot"/> Rooms are private and secure</div></section><section className="recent-card"><div className="section-heading"><div><h3>Your recent rooms</h3><p>Pick up where you left off.</p></div><button className="text-link" onClick={() => notify('You’re all caught up')}>See all <ArrowUpRight size={14}/></button></div><div className="recent-list">{initialMeetings.map((item, i) => <button key={item.code} className="meeting-row" onClick={() => {setCode(item.code); setJoinError('We couldn’t find that meeting code. Check it and try again.'); window.scrollTo({top:0,behavior:'smooth'});}}><span className={`meeting-avatar avatar-${item.color}`}>{item.initials}</span><span className="meeting-info"><strong>{item.title}</strong><small><span className="past-dot"/> {item.date}</small></span><span className="meeting-arrow"><ArrowUpRight size={16}/></span></button>)}</div></section></div><footer className="dashboard-footer"><span>Made for the moments that matter <span className="footer-heart">♥</span></span><span>Meetly © 2024 <i/> <button onClick={() => notify('Privacy policy')}>Privacy</button><i/> <button onClick={() => notify('Terms of service')}>Terms</button></span></footer></div></main><Toast message={toast}/></div>;
}
function Toast({ message }) { return <div className={`toast ${message ? 'visible' : ''}`}><Check size={16}/>{message}</div>; }
export default App;
