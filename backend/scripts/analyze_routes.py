"""
Script to refactor server.py into modular router files.
This reads the original server.py and creates new files mechanically.
"""
import re

with open('/app/backend/server.py', 'r') as f:
    lines = f.readlines()

total_lines = len(lines)
print(f"Total lines in server.py: {total_lines}")

# Find all route decorators and their line numbers
routes = []
for i, line in enumerate(lines):
    if line.strip().startswith('@api_router.'):
        routes.append((i+1, line.strip()))

print(f"\nFound {len(routes)} route decorators:")
for num, route in routes:
    print(f"  Line {num}: {route}")
