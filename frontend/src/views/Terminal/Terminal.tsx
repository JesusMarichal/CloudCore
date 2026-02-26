import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Server, Send, Trash2, Activity } from 'lucide-react';
import { serverService } from '../../services/server.service';
import type { CreateServerData } from '../../services/server.service';
import './Terminal.css';

interface TerminalLine {
    type: 'command' | 'output' | 'error';
    text: string;
    serverName?: string;
}

const Terminal = () => {
    const [servers, setServers] = useState<CreateServerData[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>('');
    const [command, setCommand] = useState('');
    const [history, setHistory] = useState<TerminalLine[]>([]);
    const [executing, setExecuting] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadServers = async () => {
            const userStr = localStorage.getItem('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const data = await serverService.list(user.id);
                setServers(data);
                if (data.length > 0) {
                    setSelectedServerId(data[0].id || '');
                }
                setTimeout(() => setInitializing(false), 1500); // Pequeño delay artificial para feedback visual
            } else {
                setInitializing(false);
            }
        };
        loadServers();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history]);

    const handleExecute = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!command.trim() || !selectedServerId || executing) return;

        const server = servers.find(s => s.id === selectedServerId);
        const currentCommand = command.trim();

        // Add command to history
        setHistory(prev => [...prev, {
            type: 'command',
            text: currentCommand,
            serverName: server?.name
        }]);

        setCommand('');
        setExecuting(true);

        try {
            const res = await serverService.executeCommand(selectedServerId, currentCommand);
            if (res.success) {
                setHistory(prev => [...prev, { type: 'output', text: res.output || '(Sin salida)' }]);
            } else {
                setHistory(prev => [...prev, { type: 'error', text: `Error: ${res.message}` }]);
            }
        } catch (error) {
            setHistory(prev => [...prev, { type: 'error', text: `Error de red: ${(error as Error).message}` }]);
        } finally {
            setExecuting(false);
        }
    };

    const clearHistory = () => {
        setHistory([]);
    };

    const selectedServer = servers.find(s => s.id === selectedServerId);

    return (
        <div className="terminal-view">
            <div className="terminal-header-top">
                <div className="terminal-title">
                    <TerminalIcon size={20} className="icon-blue" />
                    <h1>Consola SSH</h1>
                </div>

                <div className="terminal-controls">
                    <div className="server-selector">
                        <Server size={14} className="icon-dim" />
                        <select
                            value={selectedServerId}
                            onChange={(e) => setSelectedServerId(e.target.value)}
                            disabled={executing}
                        >
                            {servers.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>
                            ))}
                            {servers.length === 0 && <option value="">No hay servidores</option>}
                        </select>
                    </div>
                    <button className="btn-clear" onClick={clearHistory} title="Limpiar terminal">
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="terminal-window">
                <div className="terminal-scroll" ref={scrollRef}>
                    {history.length === 0 && !executing && (
                        <div className="terminal-welcome">
                            <Activity size={40} className="welcome-icon" />
                            <p>Conectado a: <strong>{selectedServer?.name || '...'}</strong> ({selectedServer?.ip || 'N/A'})</p>
                            <p className="dim">Escribe un comando para empezar (ej: ls, top, pm2 list)</p>
                        </div>
                    )}

                    {history.map((line, i) => (
                        <div key={i} className={`terminal-line ${line.type}`}>
                            {line.type === 'command' && (
                                <div className="command-prompt">
                                    <span className="prompt-user">ubuntu@{line.serverName || 'server'}:~$</span>
                                    <span className="prompt-text">{line.text}</span>
                                </div>
                            )}
                            {line.type === 'output' && (
                                <pre className="output-text">{line.text}</pre>
                            )}
                            {line.type === 'error' && (
                                <div className="error-text">{line.text}</div>
                            )}
                        </div>
                    ))}

                    {executing && (
                        <div className="terminal-line output">
                            <span className="cursor-loading">_</span>
                        </div>
                    )}
                </div>

                <form className="terminal-input-row" onSubmit={handleExecute}>
                    <span className="prompt-user">ubuntu@{selectedServer?.name || 'server'}:~$</span>
                    <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder={initializing ? "Conectando a terminal..." : executing ? "Ejecutando..." : "Escribe un comando..."}
                        disabled={initializing || executing || !selectedServerId}
                        autoFocus
                    />
                    <button type="submit" disabled={initializing || executing || !command.trim() || !selectedServerId}>
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Terminal;
