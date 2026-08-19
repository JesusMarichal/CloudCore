import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as TerminalIcon, Server, Trash2, X, Plug, ChevronDown, Check } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import { tokenStorage } from '../../services/tokenStorage';
import '@xterm/xterm/css/xterm.css';
import { useT } from '../../i18n';
import './Terminal.css';

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected';

const WS_URL = window.location.hostname === 'localhost'
    ? 'ws://localhost:3000/ws/terminal'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/terminal`;

const Terminal = () => {
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [selectedServerId, setSelectedServerId] = useState('');
    const t = useT();
    const [status, setStatus] = useState<Status>('idle');
    const [serverMenuOpen, setServerMenuOpen] = useState(false);

    const termContainerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const onDataDisposable = useRef<{ dispose: () => void } | null>(null);
    const serverMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadServers = async () => {
            if (!tokenStorage.getToken()) return;
            const data = await serverService.list();
            setServers(data);
            if (data.length > 0) setSelectedServerId(data[0].id || '');
        };
        loadServers();
    }, []);

    // Cerrar el menú de servidores al hacer clic fuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (serverMenuRef.current && !serverMenuRef.current.contains(e.target as Node))
                setServerMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Initialize xterm once on mount
    useEffect(() => {
        if (!termContainerRef.current) return;

        const term = new XTerminal({
            theme: {
                background: '#0d1117',
                foreground: '#e6edf3',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selectionBackground: 'rgba(88, 166, 255, 0.25)',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 14,
            lineHeight: 1.5,
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termContainerRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.writeln(`\x1b[90m${t('terminal.welcome')}\x1b[0m`);
        term.writeln(`\x1b[90m${t('terminal.welcomeHint')}\x1b[0m`);
        term.writeln('');

        // Resize observer — keeps PTY in sync with container size
        const observer = new ResizeObserver(() => {
            fitAddon.fit();
            if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
                const { rows, cols } = xtermRef.current;
                wsRef.current.send('\x01' + JSON.stringify({ type: 'resize', rows, cols }));
            }
        });
        observer.observe(termContainerRef.current);

        return () => {
            observer.disconnect();
            onDataDisposable.current?.dispose();
            wsRef.current?.close();
            term.dispose();
        };
    }, []);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        onDataDisposable.current?.dispose();
        onDataDisposable.current = null;
        setStatus('disconnected');
    }, []);

    const connect = useCallback(() => {
        if (!selectedServerId || !xtermRef.current) return;

        setStatus('connecting');
        wsRef.current?.close();

        const token = tokenStorage.getToken() ?? '';
        const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send('\x01' + JSON.stringify({ type: 'init', serverId: selectedServerId }));

            // Send current terminal dimensions
            if (xtermRef.current) {
                fitAddonRef.current?.fit();
                const { rows, cols } = xtermRef.current;
                ws.send('\x01' + JSON.stringify({ type: 'resize', rows, cols }));
            }

            // Wire up xterm keystrokes → WebSocket
            onDataDisposable.current?.dispose();
            onDataDisposable.current = xtermRef.current!.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(data);
            });

            setStatus('connected');
        };

        ws.onmessage = (e) => {
            xtermRef.current?.write(e.data);
        };

        ws.onclose = () => {
            onDataDisposable.current?.dispose();
            onDataDisposable.current = null;
            setStatus('disconnected');
        };

        ws.onerror = () => {
            xtermRef.current?.writeln(`\r\n\x1b[31m${t('terminal.wsError')}\x1b[0m`);
            setStatus('disconnected');
        };
    }, [selectedServerId]);

    const handleServerChange = (id: string) => {
        setSelectedServerId(id);
        if (status === 'connected' || status === 'disconnected') {
            disconnect();
            xtermRef.current?.writeln(`\r\n\x1b[90m${t('terminal.serverChanged')}\x1b[0m\r\n`);
        }
    };

    const clear = () => xtermRef.current?.clear();

    const selectedServer = servers.find(s => s.id === selectedServerId) || null;

    const statusLabel: Record<Status, { text: string; cls: string }> = {
        idle: { text: '', cls: '' },
        connecting: { text: t('terminal.connecting'), cls: 'connecting' },
        connected: { text: t('terminal.connected'), cls: 'connected' },
        disconnected: { text: t('terminal.disconnected'), cls: 'disconnected' },
    };

    return (
        <div className="terminal-view">
            <div className="terminal-header-top">
                <div className="terminal-title">
                    <MorphIcon icon={TerminalIcon} size={20} className="icon-blue" />
                    <h1>{t('terminal.title')}</h1>
                    {status !== 'idle' && (
                        <span className={`status-badge ${statusLabel[status].cls}`}>
                            {statusLabel[status].text}
                        </span>
                    )}
                </div>

                <div className="terminal-controls">
                    <div className="server-selector" ref={serverMenuRef}>
                        <button
                            type="button"
                            className="server-selector-trigger"
                            onClick={() => setServerMenuOpen(o => !o)}
                            disabled={status === 'connecting' || servers.length === 0}
                        >
                            <MorphIcon icon={Server} size={14} className="icon-dim" />
                            <span className="server-selector-label">
                                {selectedServer ? `${selectedServer.name} (${selectedServer.ip})` : t('terminal.noServers')}
                            </span>
                            <MorphIcon icon={ChevronDown} size={14} className={`server-selector-chevron ${serverMenuOpen ? 'open' : ''}`} />
                        </button>

                        {serverMenuOpen && servers.length > 0 && (
                            <div className="server-dropdown-menu">
                                {servers.map(s => (
                                    <button
                                        type="button"
                                        key={s.id}
                                        className={`server-dropdown-item ${s.id === selectedServerId ? 'active' : ''}`}
                                        onClick={() => { handleServerChange(s.id || ''); setServerMenuOpen(false); }}
                                    >
                                        <span className={`server-dropdown-dot ${s.status}`} />
                                        <span className="server-dropdown-name">{s.name}</span>
                                        <span className="server-dropdown-ip">{s.ip}</span>
                                        {s.id === selectedServerId && <MorphIcon icon={Check} size={14} className="server-dropdown-check" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {status === 'connected' ? (
                        <button className="btn-disconnect" onClick={disconnect}>
                            <MorphIcon icon={X} size={14} /> {t('terminal.disconnect')}
                        </button>
                    ) : (
                        <button
                            className="btn-connect"
                            onClick={connect}
                            disabled={!selectedServerId || status === 'connecting'}
                        >
                            <MorphIcon icon={Plug} size={14} /> {status === 'connecting' ? t('terminal.connectingBtn') : status === 'disconnected' ? t('terminal.reconnect') : t('terminal.connect')}
                        </button>
                    )}

                    <button className="btn-clear" onClick={clear} title={t('terminal.clear')}>
                        <MorphIcon icon={Trash2} size={16} />
                    </button>
                </div>
            </div>

            <div className="terminal-window">
                <div ref={termContainerRef} className="xterm-container" />
            </div>
        </div>
    );
};

export default Terminal;
