import React, {useEffect, useState} from 'react';

interface User {
  access_token?: string,
  refresh_token?: string,
}

const ReportPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState(null as User | null)

  useEffect(() => {
    // Create a scoped async function in the hook
    async function runAsync() {
      try {
        const response = await fetch(`${process.env.REACT_APP_AUTH_API_URL}/user`, {credentials: 'include'});
        if (response.ok) {
          const userResponse = await response.text();
          setUser(JSON.parse(userResponse));
        }
      } catch (error) {
        // add better error handling here
      }
    }

    // Execute the created function directly
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

      const response = await fetch(`${process.env.REACT_APP_API_URL}/reports`, {credentials: 'include'});

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