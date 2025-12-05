import React, { useState, useRef } from 'react';

interface LogEntry {
  type: 'success' | 'error' | 'info';
  message: string;
  timestamp: Date;
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
        throw new Error(errorData.error || 'Failed to import customers');
      }

      const result = await response.json();
      setProgress(100);

      addLog('success', `🎉 Import completed! Processed ${result.total_records} records`);
      addLog('success', `✅ Successful: ${result.successful} customers`);
      
      if (result.failed > 0) {
        addLog('error', `❌ Failed: ${result.failed} customers`);
      }

      // Display validation errors prominently if any
      if (result.validation_errors && result.validation_errors.length > 0) {
        addLog('error', `⚠️ Validation Errors Found: ${result.validation_errors.length} row(s) failed validation`);
        addLog('info', 'Validation error details:');
        result.validation_errors.forEach((error: string) => {
          addLog('error', error);
        });
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
    <div className="container">
      <div className="logo">paddle</div>
      
      <div className="card">
        <h1 className="title">Buyer Led Migration Tool</h1>
        <p className="subtitle">
          Upload your CSV file and enter your Paddle API key to import customers in bulk
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
              >
                {showApiKey ? "👁️" : "👁️‍🗨️"}
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
                📥 Download Template
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
                  <br />
                  <small>Click to change file or drag and drop a new CSV file</small>
                </div>
              ) : (
                <div>
                  <strong>Click to select CSV file</strong>
                  <br />
                  <small>or drag and drop your CSV file here</small>
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="button"
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
            <h3>Download Results</h3>
            <div className="download-buttons">
              {importResults.successful_transactions && importResults.successful_transactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadResultsCSV('success')}
                  className="download-button success"
                >
                  📥 Download Successful Transactions ({importResults.successful_transactions.length})
                </button>
              )}
              
              {importResults.failed_transactions && importResults.failed_transactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadResultsCSV('failed')}
                  className="download-button failed"
                >
                  📥 Download Failed Transactions ({importResults.failed_transactions.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="csv-requirements">
        <h3>CSV Format Requirements</h3>
        <p>
          Your CSV file should include the following columns:
        </p>
        <ul>
          <li><strong>customer_email</strong> - Required: Customer's email address</li>
          <li><strong>customer_full_name</strong> - Required: Customer's full name</li>
          <li><strong>customer_external_id</strong> - Optional: External customer ID</li>
          <li><strong>address_country_code</strong> - Required: Country code (e.g., US, GB)</li>
          <li><strong>address_street_line1</strong> - Optional: Street address line 1</li>
          <li><strong>address_street_line2</strong> - Optional: Street address line 2</li>
          <li><strong>address_city</strong> - Optional: City</li>
          <li><strong>address_region</strong> - Optional: State/Region</li>
          <li><strong>address_postal_code</strong> - Required for: AU, CA, FR, DE, IN, IT, NL, ES, GB, US. Optional for other countries. US format: 5 digits (e.g., 12345). Canada format: A1A1A1 or A1A 1A1 (e.g., K1A0B1)</li>
          <li><strong>address_external_id</strong> - Optional: External address ID</li>
          <li><strong>business_name</strong> - Optional: Business name</li>
          <li><strong>business_company_number</strong> - Optional: Company number</li>
          <li><strong>business_tax_identifier</strong> - Optional: Tax identifier</li>
          <li><strong>business_external_id</strong> - Optional: External business ID</li>
          <li><strong>current_period_started_at</strong> - Required: Subscription period start (format: 2024-06-31T15:32:00Z)</li>
          <li><strong>current_period_ends_at</strong> - Required: Subscription period end (format: 2024-06-31T15:32:00Z)</li>
          <li><strong>zero_dollar_sub_price_id</strong> - Required: Paddle price ID for the $0 subscription (format: pri_xxxxxxxxxx)</li>
          <li><strong>subscription_price_id</strong> - Required: Subscription price ID to be stored in transaction custom_data (format: pri_xxxxxxxxxx)</li>
        </ul>
      </div>
    </div>
  );
}

export default App; 