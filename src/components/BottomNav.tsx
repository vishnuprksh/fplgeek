
import React from 'react';
import './BottomNav.css';

interface BottomNavProps {
    currentView: string;
    onChangeView: (view: any) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChangeView }) => {
    const navItems = [
        { id: 'dashboard', label: 'Team', icon: '👕' },
        { id: 'fixtures', label: 'Fixtures', icon: '📅' },
        { id: 'players', label: 'Players', icon: '🏃' },

        { id: 'ai-history', label: 'History', icon: '📜' },
    ];

    return (
        <div className="bottom-nav">
            {navItems.map((item) => (
                <button
                    key={item.id}
                    className={`bottom-nav-item ${currentView === item.id ? 'active' : ''}`}
                    onClick={() => onChangeView(item.id)}
                >
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                </button>
            ))}
        </div>
    );
};
