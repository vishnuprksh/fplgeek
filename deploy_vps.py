import pexpect
import sys
import os
import getpass
import subprocess

USER = 'root'
HOST = '31.97.232.229'
# Get password from environment or prompt
PASSWORD = os.getenv('VPS_PASSWORD')
if not PASSWORD:
    try:
        PASSWORD = getpass.getpass(f"Enter password for {USER}@{HOST}: ")
    except Exception:
        # Fallback for non-interactive environments
        print("Error: VPS_PASSWORD not set and no TTY for prompt.")
        sys.exit(1)
LOCAL_DIR = '/home/vishnuprakash/local_projects/fplgeek'
REMOTE_DIR = '/root/fplgeek'

def deploy():
    print("Creating tarball...")
    # Exclude node_modules, dist, .git, and tmp files
    # Using python's subprocess to run tar
    subprocess.run([
        'tar', '-czf', '/tmp/fplgeek.tar.gz',
        '--exclude=node_modules',
        '--exclude=dist',
        '--exclude=.git',
        '--exclude=.firebase',
        '.'
    ], cwd=LOCAL_DIR, check=True)
    
    print(f"Uploading fplgeek.tar.gz to {HOST}...")
    try:
        # SCP the file
        child = pexpect.spawn(f'scp -o StrictHostKeyChecking=no /tmp/fplgeek.tar.gz {USER}@{HOST}:/root/', encoding='utf-8', timeout=600)
        # Add EOF to expect list for passwordless login
        i = child.expect(['password:', pexpect.EOF])
        if i == 0:
            child.sendline(PASSWORD)
            child.expect(pexpect.EOF)
        elif i == 1:
             print("SCP finished (no password needed).")

        child.close() # Ensure it's closed
        print("Upload complete.")
        
        # SSH to extract and build
        print("Connecting to VPS to build and deploy...")
        child = pexpect.spawn(f'ssh -o StrictHostKeyChecking=no {USER}@{HOST}', encoding='utf-8', timeout=600)
        i = child.expect(['password:', '#', '\$'])
        if i == 0:
            child.sendline(PASSWORD)
            child.expect(['#', '\$'])
            
        # Helper for sensitive commands
        def send_cmd(c, cmd, timeout=600):
            print(f"CMD: {cmd}")
            c.sendline(cmd)
            # Use strict prompt to avoid build output matching
            c.expect(['root@srv956229:~', 'root@.+:~'], timeout=timeout)
            print(c.before)
            return c.before

        send_cmd(child, f'mkdir -p {REMOTE_DIR}')
        send_cmd(child, f'tar -xzf /root/fplgeek.tar.gz -C {REMOTE_DIR}')
        send_cmd(child, f'rm /root/fplgeek.tar.gz')
        # Combined command to ensure we are in dir
        send_cmd(child, f'cd {REMOTE_DIR} && docker compose up -d --build')
        
        print("Deployment commands executed.")
        child.sendline('exit')
        child.close()
        
    except Exception as e:
        print(f"Error: {e}")
        if 'child' in locals():
            print("Last output:")
            print(child.before)
        sys.exit(1)
    finally:
        # Cleanup local tarball
        if os.path.exists('/tmp/fplgeek.tar.gz'):
            os.remove('/tmp/fplgeek.tar.gz')

if __name__ == "__main__":
    deploy()
