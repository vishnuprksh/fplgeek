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

PASSWORD = os.getenv('VPS_PASSWORD')
if not PASSWORD:
    try:
        PASSWORD = getpass.getpass(f"Enter password for {USER}@{HOST}: ")
    except Exception:
        print("Error: VPS_PASSWORD not set and no TTY for prompt.")
        sys.exit(1)

def send_command(child, cmd, timeout=300):
    print(f"Executing: {cmd}")
    child.sendline(cmd)
    child.expect(['#', '$'], timeout=timeout)
    print(child.before)
    return child.before

def setup_vps():
    print(f"Connecting to {USER}@{HOST}...")
    try:
        child = pexpect.spawn(f'ssh -o StrictHostKeyChecking=no {USER}@{HOST}', encoding='utf-8', timeout=30)
        i = child.expect(['password:', 'root@', '#', '$'])
        if i == 0:
            child.sendline(PASSWORD)
            child.expect(['#', '$'])
        
        print("Connected.")
        
        # 1. Install Docker
        print("Checking/Installing Docker...")
        send_command(child, 'curl -fsSL https://get.docker.com -o get-docker.sh')
        send_command(child, 'sh get-docker.sh')
        
        # 2. Setup Traefik Directory
        print("Setting up Traefik...")
        send_command(child, 'mkdir -p /root/traefik')
        
        # 3. Create docker-compose.traefik.yml
        traefik_compose = """
services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    networks:
      - traefik-public
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./acme.json:/acme.json"
    command:
      - "--global.checkNewVersion=true"
      - "--global.sendAnonymousUsage=false"
      - "--entryPoints.web.address=:80"
      - "--entryPoints.websecure.address=:443"
      - "--entryPoints.web.http.redirections.entryPoint.to=websecure"
      - "--entryPoints.web.http.redirections.entryPoint.scheme=https"
      - "--entryPoints.web.http.redirections.entryPoint.permanent=true"
      - "--api=true"
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedByDefault=false"
      - "--providers.docker.network=traefik-public"
      - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
      - "--certificatesresolvers.myresolver.acme.email=vishnuprakash1999@gmail.com"
      - "--certificatesresolvers.myresolver.acme.storage=/acme.json"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik_dashboard.rule=Host(`traefik.31.97.232.229.nip.io`)"
      - "traefik.http.routers.traefik_dashboard.entrypoints=websecure"
      - "traefik.http.routers.traefik_dashboard.service=api@internal"
      - "traefik.http.routers.traefik_dashboard.tls.certresolver=myresolver"
      - "traefik.http.routers.traefik_dashboard.middlewares=auth"
      # user:password (admin:admin) - CHANGE THIS IN PRODUCTION
      - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$8EVk7rJ2$$0c.0x.7c0.0x.7c0.0x."

networks:
  traefik-public:
    external: true
"""
        # Escape $ for shell
        traefik_compose_escaped = traefik_compose.replace('$', '\\$')
        
        # Write file using cat with heredoc
        child.sendline('cat > /root/traefik/docker-compose.yml <<EOF')
        child.send(traefik_compose) # Don't escape here, pexpect sends raw string
        child.sendline('\nEOF')
        child.expect(['#', '$'])

        # 4. Create acme.json
        send_command(child, 'touch /root/traefik/acme.json')
        send_command(child, 'chmod 600 /root/traefik/acme.json')
        
        # 5. Create Network and Start Traefik
        send_command(child, 'docker network create traefik-public || true')
        
        print("Starting Traefik...")
        send_command(child, 'cd /root/traefik && docker compose up -d')
        
        print("VPS Setup Complete.")
        child.sendline('exit')
        child.close()
        
    except Exception as e:
        print(f"Error: {e}")
        # Print output for debugging
        if 'child' in locals():
            print("Last output:")
            print(child.before)
        sys.exit(1)

if __name__ == "__main__":
    setup_vps()
