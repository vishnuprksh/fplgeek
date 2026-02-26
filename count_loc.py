import os
import subprocess

def get_ignored_files():
    try:
        output = subprocess.check_output(['git', 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'], encoding='utf-8')
        return set(output.splitlines())
    except subprocess.CalledProcessError:
        return set()

def get_tracked_files():
    try:
        output = subprocess.check_output(['git', 'ls-files'], encoding='utf-8')
        return set(output.splitlines())
    except subprocess.CalledProcessError:
        return set()

def count_lines(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except Exception:
        return 0

def main():
    tracked_files = get_tracked_files()
    useful_extensions = ('.ts', '.tsx', '.py', '.js', '.html', '.css', '.json', '.md')
    
    total_lines = 0
    file_counts = []

    for filepath in tracked_files:
        if filepath.endswith(useful_extensions):
            # Exclude lock files as they are not "useful scripts" in terms of logic
            if 'package-lock.json' in filepath:
                continue
            
            lines = count_lines(filepath)
            total_lines += lines
            file_counts.append((filepath, lines))

    # Sort by line count for visibility
    file_counts.sort(key=lambda x: x[1], reverse=True)

    print(f"Total useful scripts line count: {total_lines}")
    print("\nTop 10 files by line count:")
    for path, count in file_counts[:10]:
        print(f"{path}: {count}")

if __name__ == "__main__":
    main()
