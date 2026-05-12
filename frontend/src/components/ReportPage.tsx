import React, {useEffect, useState} from 'react';

interface User {
  access_token?: string,
  refresh_token?: string,
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  // RFC 5987 filename* first, then quoted or plain filename= (backend uses filename="...").
  if (!header) return null;
  const utf8Match = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return utf8Match[1].trim().replace(/^"|"$/g, '');
    }
  }
  const asciiMatch = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;\s]+)/i);
  return asciiMatch ? asciiMatch[1].trim() : null;
}

const ReportPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState(null as User | null)

  useEffect(() => {
    async function runAsync() {
      try {
        // Session cookie is host-scoped; credentials sends cookies set by bionicpro-auth on login.
        const response = await fetch(`${process.env.REACT_APP_AUTH_API_URL}/user`, {credentials: 'include'});
        if (response.ok) {
          const userResponse = await response.text();
          setUser(JSON.parse(userResponse));
        }
      } catch (error) {
        // Ignore: unauthenticated users see the login link below.
      }
    }

    runAsync()
    // https://stackoverflow.com/a/55854902/1098564
    // eslint-disable-next-line
  }, [])

  const downloadReport = async () => {
    if (!user) {
      setError('Not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${process.env.REACT_APP_API_URL}/reports`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // FastAPI errors are JSON { detail }; fall back to raw body text.
        const text = await response.text();
        let message = text || response.statusText || `Request failed (${response.status})`;
        try {
          const body = JSON.parse(text) as {detail?: string | string[]};
          if (body.detail !== undefined) {
            message = Array.isArray(body.detail)
              ? body.detail.join(', ')
              : String(body.detail);
          }
        } catch {
          /* plain-text body */
        }
        setError(message);
        return;
      }

      // Updates HttpOnly cookies from bionicpro-auth without JS reading them.
      const blob = await response.blob();
      const filename =
        parseFilenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
        'report.csv';

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url); // Allow GC after the synthetic click.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <a
          href={`${process.env.REACT_APP_AUTH_API_URL}/login?redirectUrl=${encodeURI(window.location.href)}`}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Login
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Generating Report...' : 'Download Report'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;