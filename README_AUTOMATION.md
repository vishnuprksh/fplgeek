# FPL Geek Automation Guide 🤖

This guide explains how to use the automated update system to keep the FPL Geek application data and AI models fresh.

## Manual Execution

You can run the update process manually at any time using:

```bash
bash scripts/weekly_update.sh
```

The script will:
1. Fetch latest data from the FPL API.
2. Regenerate processed datasets.
3. Retrain the AI models.
4. Output new predictions for the web interface.

Logs are stored in `weekly_update.log`.

## Automated Weekly Update (Cron Job)

To keep the app updated automatically, set up a cron job on your server. We recommend running this **every Tuesday morning** (post-gameweek) or whenever the FPL data reset happens.

### 1. Open your crontab
```bash
crontab -e
```

### 2. Add the following line
Adjust the path to match your project root:

```bash
# Run weekly update every Tuesday at 4:00 AM
0 4 * * 2 cd /path/to/fplgeek && bash scripts/weekly_update.sh
```

### 3. Verify the cron job
```bash
crontab -l
```

## Troubleshooting
- **Permissions**: Ensure the script is executable: `chmod +x scripts/weekly_update.sh`.
- **Environment**: If running via cron, ensure `node` and `python3` are in the system's PATH or provided as absolute paths in the script.
- **Venv**: If you use a virtual environment, activate it in the script or use the absolute path to the venv's python binary.
