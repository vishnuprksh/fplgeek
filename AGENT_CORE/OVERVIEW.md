# Project Overview: FPL Geek
**North Star:** Provide a comprehensive tool for Fantasy Premier League (FPL) players to analyze data, predict player performance using AI, and optimize their squads.
**Core Architecture:** 
- Frontend: React (Vite, TypeScript)
- Backend: Node.js (Express, TypeScript)
- Database: SQLite (SQL.js for frontend consumption)
- AI/ML: Unified Random Forest model (Scikit-learn) with position as input feature
- Feature Vector: 19 dimensions (9 context + 9 rolling-6 + 1 position encoding)
**Guiding Principles:** 
- Data-driven decision making.
- Seamless integration between AI predictions and squad optimization.
- Local-first approach for database access in the frontend where possible.
**Constraints:** 
- Relies on FPL API for real-time data.
- Frontend uses SQL.js to query a local SQLite file.
