import sqlite3
import imaplib
conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()
cursor.execute("SELECT email_address, app_password, pin FROM core_sharedinbox")
rows = cursor.fetchall()
for row in rows:
    email, password, pin = row
    print("Testing:", email, pin)
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(email, password)
        print(" -> Login SUCCESS")
        mail.select("INBOX")
        result, data = mail.search(None, 'ALL')
        print(" -> Search Inbox count:", len(data[0].split()))
        mail.logout()
    except Exception as e:
        print(" -> Login FAILED:", str(e))
