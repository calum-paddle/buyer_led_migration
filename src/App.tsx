import React, { useState, useRef } from 'react';

interface LogEntry {
  type: 'success' | 'error' | 'info';
  message: string;
  timestamp: Date;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M3 3l18 18" strokeLinecap="round" />
        <path d="M10.6 10.6a2 2 0 002.8 2.8" strokeLinecap="round" />
        <path d="M9.9 5.1A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a12.3 12.3 0 01-4.2 5.1M6.1 6.1A12.4 12.4 0 001 12.5C2.7 16.9 7 20 12 20c1.6 0 3.1-.3 4.5-.9" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z" />
      <circle cx="12" cy="12.5" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (type: 'success' | 'error' | 'info', message: string) => {
    setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      addLog('info', `Selected file: ${file.name}`);
    } else if (file) {
      addLog('error', 'Please select a valid CSV file');
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      addLog('info', `Dropped file: ${file.name}`);
    } else {
      addLog('error', 'Please drop a valid CSV file');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!apiKey.trim()) {
      addLog('error', 'Please enter your Paddle API key');
      return;
    }
    
    if (!csvFile) {
      addLog('error', 'Please select a CSV file');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setLogs([]);
    addLog('info', 'Starting bulk customer import...');

    try {
      const formData = new FormData();
      formData.append('csv_file', csvFile);
      formData.append('api_key', apiKey);
      formData.append('is_sandbox', isSandbox.toString());

      addLog('info', 'Uploading file and processing data...');
      addLog('info', `📁 File: ${csvFile.name} (${csvFile.size} bytes)`);
      addLog('info', `🔑 API key: ${apiKey ? 'Provided' : 'Missing'}`);
      addLog('info', `🌐 Environment: ${isSandbox ? 'Sandbox' : 'Production'}`);
      setProgress(10);

      console.log('🚀 Sending request to backend...');
      let response;
      try {
        response = await fetch('http://localhost:5001/api/import', {
          method: 'POST',
          body: formData,
        });
      } catch (fetchError) {
        addLog('error', '❌ Failed to connect to backend server');
        addLog('error', 'Please make sure the Flask backend is running on http://localhost:5001');
        addLog('info', 'You can start it by running: python app.py');
        throw new Error('Backend server is not reachable. Please ensure the Flask server is running on port 5001.');
      }
      
      console.log('📥 Response received:', response.status, response.statusText);

      setProgress(50);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          throw new Error(`Server returned error status ${response.status}: ${response.statusText}`);
        }

        // Validation failures: show row-level details, not a successful import
        if (errorData.validation_errors && errorData.validation_errors.length > 0) {
          setProgress(100);
          addLog('error', `⚠️ Validation failed for ${errorData.validation_errors.length} row(s). No records were imported.`);
          addLog('info', 'Validation error details:');
          errorData.validation_errors.forEach((error: string) => {
            addLog('error', error);
          });
          setImportResults(null);
          return;
        }

        throw new Error(errorData.error || 'Failed to import customers');
      }

      const result = await response.json();
      setProgress(100);

      addLog('success', `🎉 Import completed! Processed ${result.total_records} records`);
      addLog('success', `✅ Successful: ${result.successful} customers`);
      
      if (result.failed > 0) {
        addLog('error', `❌ Failed: ${result.failed} customers`);
      }

      // Log transaction results
      if (result.successful_transactions && result.successful_transactions.length > 0) {
        addLog('success', `💳 Successful transactions: ${result.successful_transactions.length}`);
      }
      
      if (result.failed_transactions && result.failed_transactions.length > 0) {
        addLog('error', `❌ Failed transactions: ${result.failed_transactions.length}`);
      }

      // Display other errors (non-validation)
      const otherErrors = result.errors?.filter((error: string) => 
        !result.validation_errors?.includes(error)
      ) || [];
      if (otherErrors.length > 0) {
        addLog('info', 'Other error details:');
        otherErrors.slice(0, 5).forEach((error: string) => {
          addLog('error', error);
        });
        if (otherErrors.length > 5) {
          addLog('info', `... and ${otherErrors.length - 5} more errors`);
        }
      }

      // Store results for CSV download
      setImportResults(result);
      
    } catch (error) {
      addLog('error', `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const downloadTemplate = () => {
    const headers = [
      'customer_email',
      'customer_full_name',
      'customer_external_id',
      'address_country_code',
      'address_street_line1',
      'address_street_line2',
      'address_city',
      'address_region',
      'address_postal_code',
      'address_external_id',
      'business_name',
      'business_company_number',
      'business_tax_identifier',
      'business_external_id',
      'current_period_started_at',
      'current_period_ends_at',
      'zero_dollar_sub_price_id', // NEW required column
      'subscription_price_id'
    ];
    
    const exampleData = [
      'john@example.com',
      'John Doe',
      'CUST001',
      'US',
      '123 Main St',
      'Apt 4B',
      'New York',
      'NY',
      '10001',
      'ADDR001',
      'Acme Corp',
      '123456789',
      'GB123456789',
      'BIZ001',
      '2024-06-31T15:32:00Z',
      '2024-07-31T15:32:00Z',
      'pri_1234567890', // Example price ID
      'pri_0987654321' // Example price ID
    ];
    
    const csvContent = [
      headers.join(','),
      exampleData.join(',')
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paddle_customer_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    addLog('info', 'CSV template downloaded successfully');
  };

  const downloadResultsCSV = async (type: 'success' | 'failed') => {
    if (!importResults) return;
    
    try {
      const data = type === 'success' ? importResults.successful_transactions : importResults.failed_transactions;
      
      if (!data || data.length === 0) {
        addLog('info', `No ${type} transactions to download`);
        return;
      }

      const response = await fetch('http://localhost:5001/api/download-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          data
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate CSV');
      }

      const result = await response.json();
      
      // Create and download the CSV file
      const blob = new Blob([result.csv_content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      addLog('success', `${type === 'success' ? 'Successful' : 'Failed'} transactions CSV downloaded`);
    } catch (error) {
      addLog('error', `Failed to download ${type} CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">paddle</span>
          <span className="brand-suffix">Import</span>
        </div>
        <div className="header-meta">Buyer-led migration</div>
      </header>

      <main className="main">
        <div className="breadcrumb">
          Home <span>/</span> Migration
        </div>

        <section className="hero">
          <h1 className="hero-title">Buyer Led Migration</h1>
          <p className="hero-subtitle">
            Upload your CSV and enter your Paddle API key to import customers,
            addresses, and businesses in bulk.
          </p>
        </section>

        <details className="card instructions-card">
          <summary className="instructions-summary">
            <div>
              <div className="section-label">How it works</div>
              <h2 className="card-title">Migration instructions</h2>
              <p className="card-desc instructions-preview">
                Prepare prices, import subscribers on a $0 plan, then move them
                to the correct plan after they save payment details.
              </p>
            </div>
            <span className="instructions-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <ol className="instructions-list">
            <li>Download the CSV template and fill it with your subscriber data.</li>
            <li>In Paddle, create a <strong>$0 price</strong> for the migration plan.</li>
            <li>Create the real prices for each destination plan.</li>
            <li>Run the importer with your completed CSV. Subscribers are created on the $0 plan.</li>
            <li>
              Download the results CSV. Each row includes a checkout link — email
              it to the subscriber so they can save their payment method.
            </li>
            <li>
              Handle the <code>transaction.completed</code> webhook. The
              transaction <code>custom_data</code> includes the target plan&apos;s
              price ID.
            </li>
            <li>
              Update the subscription to that price ID with{' '}
              <code>proration_billing_mode: do_not_bill</code> using the{' '}
              <a
                href="https://developer.paddle.com/api-reference/subscriptions/update-subscription"
                target="_blank"
                rel="noopener noreferrer"
              >
                update subscription API
              </a>
              . The subscriber is then on the correct plan and billing dates;
              Paddle charges at the next renewal.
            </li>
          </ol>
        </details>

        <section className="card" id="import-form">
          <div className="section-label">Import</div>
          <h2 className="card-title">Configure your import</h2>
          <p className="card-desc">
            Choose sandbox or production, add your API key, then upload a CSV
            that matches the required format.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="apiKey" className="label">
                Paddle API Key
              </label>
              <div className="input-with-toggle">
                <input
                  type={showApiKey ? "text" : "password"}
                  id="apiKey"
                  className="input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Paddle API key"
                  disabled={isProcessing}
                />
                <button
                  type="button"
                  className="toggle-button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  disabled={isProcessing}
                  title={showApiKey ? "Hide API key" : "Show API key"}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  <EyeIcon open={showApiKey} />
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="label">
                Environment
              </label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="environment-toggle"
                  checked={isSandbox}
                  onChange={(e) => {
                    const newIsSandbox = e.target.checked;
                    setIsSandbox(newIsSandbox);
                    const apiUrl = newIsSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
                    console.log(`🌐 Environment switched to: ${newIsSandbox ? 'Sandbox' : 'Production'}`);
                    console.log(`🔗 API URL: ${apiUrl}`);
                  }}
                  disabled={isProcessing}
                />
                <label htmlFor="environment-toggle" className="toggle-label">
                  <span className="toggle-text">{isSandbox ? 'Sandbox' : 'Production'}</span>
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <small className="environment-help">
                {isSandbox ? 'Using sandbox environment for testing' : 'Using production environment - real data will be created'}
              </small>
            </div>

            <div className="form-group">
              <label className="label">CSV File</label>
              <div className="template-download">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="template-button"
                  disabled={isProcessing}
                >
                  Download template
                </button>
                <small>Get a CSV template with the correct headers and example data</small>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="file-input"
                disabled={isProcessing}
              />
              <div
                className={`file-label ${dragOver ? 'dragover' : ''}`}
                onClick={handleFileClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {csvFile ? (
                  <div>
                    <strong>Selected: {csvFile.name}</strong>
                    <small>Click to change file or drag and drop a new CSV file</small>
                  </div>
                ) : (
                  <div>
                    <strong>Click to select CSV file</strong>
                    <small>or drag and drop your CSV file here</small>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="button button-accent"
              disabled={isProcessing || !apiKey.trim() || !csvFile}
            >
              {isProcessing ? (
                <>
                  <span className="spinner"></span>
                  Processing... {Math.round(progress)}%
                </>
              ) : (
                'Start Import'
              )}
            </button>
          </form>

          {isProcessing && (
            <div className="progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="logs">
              {logs.map((log, index) => (
                <div key={index} className={`log-entry ${log.type}`}>
                  [{log.timestamp.toLocaleTimeString()}] {log.message}
                </div>
              ))}
            </div>
          )}

          {importResults && !importResults.validation_errors?.length && (
            <div className="download-section">
              <div className="download-section-header">
                <span className="download-section-icon" aria-hidden="true">
                  <DownloadIcon />
                </span>
                <div>
                  <h3>Download results</h3>
                  <p className="download-section-desc">
                    Export CSV files with transaction IDs and checkout links.
                  </p>
                </div>
              </div>
              <div className="download-buttons">
                {importResults.successful_transactions && importResults.successful_transactions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadResultsCSV('success')}
                    className="download-button success"
                  >
                    <DownloadIcon />
                    Download successful
                    <span className="download-count">{importResults.successful_transactions.length}</span>
                  </button>
                )}
                
                {importResults.failed_transactions && importResults.failed_transactions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadResultsCSV('failed')}
                    className="download-button failed"
                  >
                    <DownloadIcon />
                    Download failed
                    <span className="download-count">{importResults.failed_transactions.length}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card csv-requirements">
          <div className="section-label">Reference</div>
          <h2 className="card-title">CSV format requirements</h2>
          <p className="card-desc">
            Your CSV file should include the following columns:
          </p>
          <ul>
            <li><strong>customer_email</strong> — Required: Customer's email address</li>
            <li><strong>customer_full_name</strong> — Optional: Customer's full name</li>
            <li><strong>customer_external_id</strong> — Optional: External customer ID</li>
            <li><strong>address_country_code</strong> — Required: Country code (e.g., US, GB)</li>
            <li><strong>address_street_line1</strong> — Optional: Street address line 1</li>
            <li><strong>address_street_line2</strong> — Optional: Street address line 2</li>
            <li><strong>address_city</strong> — Optional: City</li>
            <li><strong>address_region</strong> — Optional: State/Region</li>
            <li><strong>address_postal_code</strong> — Required for: AU, CA, FR, DE, IN, IT, NL, ES, GB, US. Optional for other countries. US format: 5 digits (e.g., 12345). Canada format: A1A1A1 or A1A 1A1 (e.g., K1A0B1)</li>
            <li><strong>address_external_id</strong> — Optional: External address ID</li>
            <li><strong>business_name</strong> — Optional: Business name</li>
            <li><strong>business_company_number</strong> — Optional: Company number</li>
            <li><strong>business_tax_identifier</strong> — Optional: Tax identifier</li>
            <li><strong>business_external_id</strong> — Optional: External business ID</li>
            <li><strong>current_period_started_at</strong> — Required: Subscription period start (format: 2024-06-31T15:32:00Z)</li>
            <li><strong>current_period_ends_at</strong> — Required: Subscription period end (format: 2024-06-31T15:32:00Z)</li>
            <li><strong>zero_dollar_sub_price_id</strong> — Required: Paddle price ID for the $0 subscription (format: pri_xxxxxxxxxx)</li>
            <li><strong>subscription_price_id</strong> — Required: Subscription price ID to be stored in transaction custom_data (format: pri_xxxxxxxxxx)</li>
          </ul>
        </section>
      </main>

      <footer className="site-footer">
        Built for Paddle buyer-led migrations
      </footer>
    </div>
  );
}

export default App;
