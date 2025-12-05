from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import requests
import os
from werkzeug.utils import secure_filename
import tempfile

app = Flask(__name__)
CORS(app)

# Helper function to replace NaN with None and convert everything to string
def clean_value(val):
    if pd.isna(val):
        return None
    if isinstance(val, float):
        if val != val or val in [float('inf'), float('-inf')]:
            return None
    return str(val).strip()

@app.route('/api/import', methods=['POST'])
def import_customers():
    print("📥 Received import request")
    print(f"📋 Request method: {request.method}")
    print(f"📁 Files in request: {list(request.files.keys())}")
    print(f"📝 Form data keys: {list(request.form.keys())}")
    
    try:
        # Check if files and API key are present
        if 'csv_file' not in request.files:
            print("❌ No CSV file in request")
            return jsonify({'error': 'No CSV file provided'}), 400
        
        if 'api_key' not in request.form:
            print("❌ No API key in request")
            return jsonify({'error': 'No API key provided'}), 400
        
        csv_file = request.files['csv_file']
        api_key = request.form['api_key']
        is_sandbox = request.form.get('is_sandbox', 'false').lower() == 'true'
        
        print(f"📄 CSV file: {csv_file.filename}")
        print(f"🔑 API key provided: {'Yes' if api_key else 'No'}")
        print(f"🌐 Environment: {'Sandbox' if is_sandbox else 'Production'}")
        
        if csv_file.filename == '':
            print("❌ No file selected")
            return jsonify({'error': 'No file selected'}), 400
        
        if not csv_file.filename.endswith('.csv'):
            print("❌ File is not a CSV")
            return jsonify({'error': 'File must be a CSV'}), 400
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp_file:
            csv_file.save(tmp_file.name)
            csv_path = tmp_file.name
        
        try:
            print("📊 Loading CSV data...")
            # Load CSV data
            data = pd.read_csv(csv_path, dtype=str).where(pd.notnull(pd.read_csv(csv_path, dtype=str)), None)
            print(f"📈 Loaded {len(data)} rows from CSV")
            
            # Paddle API setup
            API_URL = "https://sandbox-api.paddle.com" if is_sandbox else "https://api.paddle.com"
            HEADERS = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            print(f"🌐 Using Paddle API: {API_URL}")
            
            results = {
                'total_records': len(data),
                'successful': 0,
                'failed': 0,
                'errors': [],
                'successful_transactions': [],
                'failed_transactions': []
            }
            
            # Process each row
            print(f"🔄 Starting to process {len(data)} records...")
            for index, row in data.iterrows():
                try:
                    print(f"👤 Processing row {index + 1}/{len(data)}: {clean_value(row['customer_email'])}")
                    # 1. Create customer
                    customer_payload = {
                        "email": clean_value(row['customer_email']),
                        "name": clean_value(row['customer_full_name']),
                        "custom_data": {
                            "external_id": clean_value(row['customer_external_id'])
                        } if clean_value(row.get('customer_external_id')) else None,
                        "locale": "en"
                    }

                    print(f"📤 Creating customer: {clean_value(row['customer_email'])}")
                    print(f"📦 Customer payload: {customer_payload}")
                    response = requests.post(f"{API_URL}/customers", headers=HEADERS, json=customer_payload)
                    print(f"📥 Response status: {response.status_code}")
                    
                    if response.status_code != 201:
                        error_msg = f"Failed to create customer {row['customer_email']}: {response.text}"
                        print(f"❌ {error_msg}")
                        results['errors'].append(error_msg)
                        results['failed'] += 1
                        continue

                    customer_id = response.json()['data']['id']
                    print(f"✅ Created customer {customer_id}")
                    results['successful'] += 1

                    # 2. Create address if country_code is present
                    if clean_value(row.get('address_country_code')):
                        address_payload = {
                            "country_code": clean_value(row['address_country_code']),
                            "first_line": clean_value(row.get('address_street_line1')),
                            "second_line": clean_value(row.get('address_street_line2')),
                            "city": clean_value(row.get('address_city')),
                            "region": clean_value(row.get('address_region')),
                            "postal_code": clean_value(row.get('address_postal_code')),
                            "description": f"Address for {clean_value(row['customer_email'])}",
                            "custom_data": {
                                "external_id": clean_value(row['address_external_id'])
                            } if clean_value(row.get('address_external_id')) else None
                        }

                        print(f"🏠 Creating address for customer {customer_id}")
                        print(f"📦 Address payload: {address_payload}")
                        response = requests.post(f"{API_URL}/customers/{customer_id}/addresses", headers=HEADERS, json=address_payload)
                        if response.status_code != 201:
                            error_msg = f"Failed to create address for {row['customer_email']}: {response.text}"
                            print(f"❌ {error_msg}")
                            results['errors'].append(error_msg)
                        else:
                            print(f"✅ Created address for customer {customer_id}")

                    # 3. Create business if business_name is present
                    if clean_value(row.get('business_name')):
                        business_payload = {
                            "name": clean_value(row['business_name']),
                            "company_number": clean_value(row.get('business_company_number')),
                            "contacts": [
                                {
                                    "name": clean_value(row['customer_full_name']),
                                    "email": clean_value(row['customer_email'])
                                }
                            ],
                            "custom_data": {
                                "external_id": clean_value(row['business_external_id'])
                            } if clean_value(row.get('business_external_id')) else None
                        }
                        
                        # Include tax_identifier if provided (let Paddle validate it)
                        tax_identifier = clean_value(row.get('business_tax_identifier'))
                        if tax_identifier:
                            business_payload["tax_identifier"] = tax_identifier

                        print(f"🏢 Creating business for customer {customer_id}")
                        print(f"📦 Business payload: {business_payload}")
                        response = requests.post(f"{API_URL}/customers/{customer_id}/businesses", headers=HEADERS, json=business_payload)
                        if response.status_code != 201:
                            error_msg = f"Failed to create business for {row['customer_email']}: {response.text}"
                            print(f"❌ {error_msg}")
                            results['errors'].append(error_msg)
                        else:
                            print(f"✅ Created business for customer {customer_id}")

                    # 4. Create transaction
                    try:
                        # Get address_id and business_id if they were created
                        address_id = None
                        business_id = None
                        
                        # Get address_id if address was created
                        if clean_value(row.get('address_country_code')):
                            address_response = requests.get(f"{API_URL}/customers/{customer_id}/addresses", headers=HEADERS)
                            if address_response.status_code == 200:
                                addresses = address_response.json()['data']
                                if addresses:
                                    address_id = addresses[0]['id']
                        
                        # Get business_id if business was created
                        if clean_value(row.get('business_name')):
                            business_response = requests.get(f"{API_URL}/customers/{customer_id}/businesses", headers=HEADERS)
                            if business_response.status_code == 200:
                                businesses = business_response.json()['data']
                                if businesses:
                                    business_id = businesses[0]['id']

                        # Prepare transaction payload
                        transaction_payload = {
                            "customer_id": customer_id,
                            "items": [
                                {
                                    "price_id": clean_value(row.get('zero_dollar_sub_price_id')),
                                    "quantity": 1
                                }
                            ]
                        }

                        # Add address_id and business_id if available
                        if address_id:
                            transaction_payload["address_id"] = address_id
                        if business_id:
                            transaction_payload["business_id"] = business_id

                        # Add billing period if dates are provided
                        if clean_value(row.get('current_period_started_at')) and clean_value(row.get('current_period_ends_at')):
                            transaction_payload["billing_period"] = {
                                "starts_at": clean_value(row['current_period_started_at']),
                                "ends_at": clean_value(row['current_period_ends_at'])
                            }

                        # Add custom_data with subscription_price_id if provided
                        subscription_price_id = clean_value(row.get('subscription_price_id'))
                        if subscription_price_id:
                            transaction_payload["custom_data"] = {
                                "subscription_price_id": subscription_price_id
                            }

                        print(f"💳 Creating transaction for customer {customer_id}")
                        print(f"📦 Transaction payload: {transaction_payload}")
                        response = requests.post(f"{API_URL}/transactions", headers=HEADERS, json=transaction_payload)
                        print(f"📥 Transaction response status: {response.status_code}")

                        if response.status_code == 201:
                            transaction_data = response.json()['data']
                            transaction_id = transaction_data.get('id')
                            checkout_url = transaction_data.get('checkout', {}).get('url')
                            
                            results['successful_transactions'].append({
                                'customer_email': clean_value(row['customer_email']),
                                'transaction_id': transaction_id,
                                'checkout_url': checkout_url
                            })
                            print(f"✅ Created transaction for customer {customer_id}")
                        else:
                            error_msg = f"Failed to create transaction for {row['customer_email']}: {response.text}"
                            print(f"❌ {error_msg}")
                            results['failed_transactions'].append({
                                'customer_email': clean_value(row['customer_email']),
                                'error': response.text
                            })
                            results['errors'].append(error_msg)
                    
                    except Exception as e:
                        error_msg = f"Error creating transaction for {row['customer_email']}: {str(e)}"
                        print(f"❌ {error_msg}")
                        results['failed_transactions'].append({
                            'customer_email': clean_value(row['customer_email']),
                            'error': str(e)
                        })
                        results['errors'].append(error_msg)
                
                except Exception as e:
                    results['errors'].append(f"Error processing row {index + 1}: {str(e)}")
                    results['failed'] += 1
            
            # Clean up temporary file
            os.unlink(csv_path)
            print(f"🎉 Import completed! Success: {results['successful']}, Failed: {results['failed']}")
            print(f"📊 Final results: {results}")
            
            return jsonify(results)
            
        except Exception as e:
            # Clean up temporary file in case of error
            if os.path.exists(csv_path):
                os.unlink(csv_path)
            raise e
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download-csv', methods=['POST'])
def download_csv():
    try:
        data = request.json
        csv_type = data.get('type')  # 'success' or 'failed'
        csv_data = data.get('data', [])
        
        if csv_type == 'success':
            # Create successful transactions CSV
            df = pd.DataFrame(csv_data)
            csv_content = df.to_csv(index=False)
            filename = 'successful_transactions.csv'
        elif csv_type == 'failed':
            # Create failed transactions CSV
            df = pd.DataFrame(csv_data)
            csv_content = df.to_csv(index=False)
            filename = 'failed_transactions.csv'
        else:
            return jsonify({'error': 'Invalid CSV type'}), 400
        
        return jsonify({
            'csv_content': csv_content,
            'filename': filename
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    print("🚀 Starting Flask backend server...")
    print("📡 API will be available at: http://localhost:5001")
    print("🔧 Debug mode: ON")
    app.run(debug=True, port=5001, host='0.0.0.0') 