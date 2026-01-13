#!/usr/bin/env python3

import subprocess
import json
import urllib.request
import urllib.error

try:
    # Get token
    result = subprocess.run(['gcloud', 'auth', 'print-access-token'], capture_output=True, text=True)
    token = result.stdout.strip()
    
    # Try to access Gmail API
    req = urllib.request.Request('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5')
    req.add_header('Authorization', f'Bearer {token}')
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            print('Successfully accessed Gmail API')
            messages = data.get('messages', [])
            print(f'Found {len(messages)} recent messages')
            
            # Get details for each message
            for i, message in enumerate(messages[:3]):  # Just get first 3
                msg_req = urllib.request.Request(f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{message["id"]}')
                msg_req.add_header('Authorization', f'Bearer {token}')
                
                with urllib.request.urlopen(msg_req) as msg_response:
                    msg_data = json.loads(msg_response.read())
                    
                    # Extract basic info
                    headers = msg_data.get('payload', {}).get('headers', [])
                    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                    sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
                    
                    print(f"\n{i+1}. From: {sender}")
                    print(f"   Subject: {subject}")
                    
    except urllib.error.HTTPError as e:
        print(f'HTTP Error: {e.code} - {e.reason}')
        if e.code == 403:
            print('This likely means insufficient permissions for Gmail access')
            print('You may need to enable Gmail API access for your Google Cloud project')
        
except Exception as e:
    print(f'Error: {e}')