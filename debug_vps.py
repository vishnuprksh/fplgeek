import pexpect
import sys
import os
import getpass

USER = 'root'
HOST = '31.97.232.229'

# Load .env manually to avoid dependencies
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, _, value = line.partition('=')
                if key.strip() == 'VPS_PASSWORD':
                    os.environ['VPS_PASSWORD'] = value.strip().strip("'").strip('"')

# Get password from environment or prompt
PASSWORD = os.getenv('VPS_PASSWORD')
if not PASSWORD:
    try:
        PASSWORD = getpass.getpass(f"Enter password for {USER}@{HOST}: ")
    except Exception:
        print("Error: VPS_PASSWORD not set and no TTY for prompt.")
        sys.exit(1)

def debug_logs():
    print(f"Connecting to {USER}@{HOST}...")
    try:
        child = pexpect.spawn(f'ssh -o StrictHostKeyChecking=no {USER}@{HOST}', encoding='utf-8', timeout=60)
        i = child.expect(['password:', '#', '\$'])
        if i == 0:
            child.sendline(PASSWORD)
            child.expect(['#', '\$'])
        
        print("Connected.")
        
        def send_cmd(cmd):
            print(f"CMD: {cmd}")
            child.sendline(cmd)
            child.expect(['#', '\$'])
            print(child.before)

        # Get logs and config
        send_cmd('docker logs fplgeek-web-1 --tail 100')

        # Check internal connectivity
        send_cmd('docker exec fplgeek-server-1 wget -qO- http://localhost:3000/health')
        send_cmd('docker exec fplgeek-web-1 wget -qO- http://server:3000/health')

        child.sendline('exit')
        child.close()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    debug_logs()
