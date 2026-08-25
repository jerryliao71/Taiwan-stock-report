"""Resilient JSON fetch for the TWSE / TPEx open-data endpoints.

TPEx serves some responses from a host whose certificate omits the Subject Key
Identifier extension. OpenSSL 3.x + Python 3.13/3.14 enable VERIFY_X509_STRICT by
default and reject it; older runtimes accept it. The behaviour is inconsistent
across their load-balanced hosts, so it cannot be handled by pinning a runtime.

Fallback clears only the STRICT flag -- the certificate chain and the hostname are
still verified against certifi. It is never disabled outright.
"""
import json, ssl, time, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (compatible; tw-equity-dashboard/1.0)'}

def _ctx(strict):
    try:
        import certifi
        c = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        c = ssl.create_default_context()
    if not strict:
        c.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return c

def fetch_json(url, tries=4, timeout=90):
    """Fetch and parse JSON, retrying with backoff.

    urllib wraps SSLCertVerificationError inside URLError, so the strict/non-strict
    fallback cannot key off the exception type -- both modes are simply attempted
    on every pass.
    """
    last = None
    for i in range(tries):
        for strict in (True, False):
            try:
                req = urllib.request.Request(url, headers=UA)
                with urllib.request.urlopen(req, context=_ctx(strict), timeout=timeout) as r:
                    return json.loads(r.read().decode('utf-8-sig'))
            except Exception as e:
                last = e
        if i < tries - 1:
            time.sleep(2 * (i + 1))
    raise RuntimeError(f'fetch failed after {tries} tries: {url} :: {type(last).__name__}: {last}')
