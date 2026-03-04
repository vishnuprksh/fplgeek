import React from 'react';
import './SkeletonLoader.css';

interface SkeletonProps {
    width?: string;
    height?: string;
    borderRadius?: string;
    margin?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = '20px',
    borderRadius = '4px',
    margin = '0'
}) => {
    return (
        <div
            className="skeleton-shimmer"
            style={{ width, height, borderRadius, margin }}
        />
    );
};

export const SkeletonTable: React.FC = () => {
    return (
        <div className="skeleton-table">
            {[...Array(10)].map((_, i) => (
                <div key={i} className="skeleton-row" style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <Skeleton width="40%" height="24px" />
                    <Skeleton width="20%" height="24px" />
                    <Skeleton width="15%" height="24px" />
                    <Skeleton width="25%" height="24px" />
                </div>
            ))}
        </div>
    );
};
