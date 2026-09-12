"""Identify the serving checkout and its runtime files without requiring Git."""
import hashlib
import os
from pathlib import Path


def identity(root):
    root = Path(root).resolve()
    digest = hashlib.sha256()
    # Cover Python loaded at startup, browser assets served later, and extension
    # source. Ignore docs, tests, recordings and Git state so commits alone do
    # not invalidate an otherwise identical server.
    files = sorted(path for folder in (root, root / 'extension')
                   for path in folder.iterdir()
                   if path.is_file() and path.suffix in ('.py', '.js', '.html', '.css', '.json'))
    for path in files:
        name = path.relative_to(root).as_posix().encode('utf-8')
        content = path.read_bytes()
        digest.update(len(name).to_bytes(8, 'big'))
        digest.update(name)
        digest.update(len(content).to_bytes(8, 'big'))
        digest.update(content)
    return {'root': os.path.normcase(str(root)), 'fingerprint': digest.hexdigest()}
