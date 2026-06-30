document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let selectedFile = null;

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const fileDetails = document.getElementById('file-details');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const btnRemove = document.getElementById('btn-remove');
    const btnIngest = document.getElementById('btn-ingest');
    
    const loadingStepper = document.getElementById('loading-stepper');
    
    // Steps
    const stepParsing = document.getElementById('step-parsing');
    const stepEmbedding = document.getElementById('step-embedding');
    const stepIngestion = document.getElementById('step-ingestion');
    
    // Indicators
    const indParsing = document.getElementById('ind-parsing');
    const indEmbedding = document.getElementById('ind-embedding');
    const indIngestion = document.getElementById('ind-ingestion');

    // Progress Bars
    const pbParsing = document.getElementById('pb-parsing');
    const pbEmbedding = document.getElementById('pb-embedding');
    const pbIngestion = document.getElementById('pb-ingestion');

    // Meta Texts
    const metaParsing = document.getElementById('meta-parsing');
    const metaEmbedding = document.getElementById('meta-embedding');
    const metaIngestion = document.getElementById('meta-ingestion');
    
    // Ingestion Results
    const ingestResult = document.getElementById('ingest-result');
    const resDocId = document.getElementById('res-doc-id');
    const resChunks = document.getElementById('res-chunks');
    const resVectors = document.getElementById('res-vectors');
    const resTime = document.getElementById('res-time');
    
    // Search
    const searchForm = document.getElementById('search-form');
    const searchQuery = document.getElementById('search-query');
    const btnSearch = document.getElementById('btn-search');
    const resultsContainer = document.getElementById('results-container');
    const searchMeta = document.getElementById('search-meta');
    const resultsCount = document.getElementById('results-count');
    
    // Health / Stats
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const statConnection = document.getElementById('stat-connection');
    const statVectors = document.getElementById('stat-vectors');
    const statDimension = document.getElementById('stat-dimension');
    const radarPing = document.querySelector('.radar-ping');
    const radarGlow = document.querySelector('.radar-glow');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // Toast Notification System
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconHtml = '';
        if (type === 'success') {
            iconHtml = '<i class="ph-fill ph-check-circle toast-icon"></i>';
        } else if (type === 'error') {
            iconHtml = '<i class="ph-fill ph-x-circle toast-icon"></i>';
        } else {
            iconHtml = '<i class="ph-fill ph-info toast-icon"></i>';
        }

        toast.innerHTML = `
            <div class="toast-icon">${iconHtml}</div>
            <div class="toast-content">
                <div class="toast-title">${escapeHtml(title)}</div>
                <div class="toast-msg">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close" title="Close"><i class="ph ph-x"></i></button>
        `;

        toastContainer.appendChild(toast);
        
        // Trigger transition
        setTimeout(() => toast.classList.add('show'), 10);

        const closeToast = () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        };

        toast.querySelector('.toast-close').addEventListener('click', closeToast);
        
        // Auto-close after 5 seconds
        setTimeout(closeToast, 5000);
    }

    // Segmented Tabs Navigation Pill Slider Setup
    const tabsNav = document.querySelector('.tabs-nav');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Inject active slider background pill
    const tabSlider = document.createElement('div');
    tabSlider.className = 'tab-slider';
    tabsNav.appendChild(tabSlider);

    function updateSlider(activeBtn) {
        if (!activeBtn) return;
        tabSlider.style.width = `${activeBtn.offsetWidth}px`;
        tabSlider.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Toggle active classes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            updateSlider(button);
            
            // Toggle active contents with fade/slide animations
            tabContents.forEach(content => {
                if (content.id === targetTab) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });

            // If entering Stats tab, refresh stats
            if (targetTab === 'stats-tab') {
                refreshStats();
            }
        });
    });

    // Update slider position on resize
    window.addEventListener('resize', () => {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab) updateSlider(activeTab);
    });

    // Initialize Slider Position
    const initialActiveTab = document.querySelector('.tab-btn.active');
    if (initialActiveTab) {
        // Run after DOM settles to measure dimensions accurately
        setTimeout(() => updateSlider(initialActiveTab), 50);
    }

    // Connection Health Verification
    async function checkHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            
            if (data.pinecone_configured) {
                statusIndicator.className = 'status-dot connected';
                statusText.textContent = 'Pipeline Connected';
                statConnection.textContent = 'Connected';
                statConnection.className = 'stat-number green';
                
                if (radarPing && radarGlow) {
                    radarPing.style.backgroundColor = 'var(--accent)';
                    radarPing.style.boxShadow = '0 0 10px var(--accent)';
                    radarGlow.style.borderColor = 'var(--accent)';
                    radarGlow.style.animation = 'radar-grow 2.5s cubic-bezier(0.1, 0.8, 0.3, 1) infinite';
                }
            } else {
                statusIndicator.className = 'status-dot disconnected';
                statusText.textContent = 'API Key Missing';
                statConnection.textContent = 'Key Missing';
                statConnection.className = 'stat-number';
                statConnection.style.color = 'var(--error)';
                
                if (radarPing && radarGlow) {
                    radarPing.style.backgroundColor = 'var(--error)';
                    radarPing.style.boxShadow = '0 0 10px var(--error)';
                    radarGlow.style.borderColor = 'var(--error)';
                    radarGlow.style.animation = 'none';
                }
                showToast('Configuration Warning', 'PINECONE_API_KEY is not set in the pipeline backend.', 'info');
            }
        } catch (e) {
            statusIndicator.className = 'status-dot disconnected';
            statusText.textContent = 'Offline';
            statConnection.textContent = 'Offline';
            statConnection.className = 'stat-number';
            statConnection.style.color = 'var(--error)';
            
            if (radarPing && radarGlow) {
                radarPing.style.backgroundColor = 'var(--error)';
                radarPing.style.boxShadow = '0 0 10px var(--error)';
                radarGlow.style.borderColor = 'var(--error)';
                radarGlow.style.animation = 'none';
            }
            showToast('Pipeline Status', 'FastAPI backend connection is offline.', 'error');
        }
    }

    // Refresh Statistics
    async function refreshStats() {
        try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            
            if (data.exists) {
                statVectors.textContent = data.total_vector_count.toLocaleString();
                statDimension.textContent = data.dimension;
            } else {
                statVectors.textContent = '0';
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    // Initialize Connection Checks
    checkHealth();
    refreshStats();

    // Drag and Drop File Handlers
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    function handleFileSelection(file) {
        selectedFile = file;
        
        // Format size
        let sizeStr = '';
        if (file.size < 1024) sizeStr = file.size + ' B';
        else if (file.size < 1048576) sizeStr = (file.size / 1024).toFixed(1) + ' KB';
        else sizeStr = (file.size / 1048576).toFixed(1) + ' MB';

        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = sizeStr;
        
        dropzone.style.display = 'none';
        fileDetails.style.display = 'flex';
        btnIngest.disabled = false;
        
        // Reset old results when selecting a new file
        ingestResult.style.display = 'none';
        loadingStepper.style.display = 'none';
        
        showToast('Document Selected', `Ready to ingest "${file.name}" into Pinecone.`, 'info');
    }

    // Remove File Handler
    btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUploadUI();
    });

    function resetUploadUI() {
        selectedFile = null;
        fileInput.value = '';
        dropzone.style.display = 'flex';
        fileDetails.style.display = 'none';
        btnIngest.disabled = true;
        btnIngest.innerHTML = '<i class="ph ph-lightning"></i> Start Pipeline Ingestion';
        loadingStepper.style.display = 'none';
        ingestResult.style.display = 'none';
    }

    // Ingestion Processing Handler with SSE Stream parsing
    btnIngest.addEventListener('click', async () => {
        if (!selectedFile) return;

        // UI Updates: Disable buttons & prepare steps
        btnIngest.disabled = true;
        btnRemove.style.display = 'none';
        btnIngest.innerHTML = '<i class="ph ph-spinner step-spinner"></i> Processing Pipeline...';
        
        loadingStepper.style.display = 'flex';
        ingestResult.style.display = 'none';
        
        resetSteps();
        
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Inference pipeline connection failed.');
            }

            // Stream Reader Setup
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Hold onto the incomplete trailing line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    if (trimmed.startsWith('data:')) {
                        const dataStr = trimmed.substring(5).trim();
                        try {
                            const eventData = JSON.parse(dataStr);
                            handleProgressEvent(eventData);
                        } catch (err) {
                            console.error('JSON parsing error on line:', dataStr, err);
                        }
                    }
                }
            }

        } catch (error) {
            showToast('Ingestion Error', error.message, 'error');
            resetUploadUI();
        }
    });

    // Handle streamed events from backend
    function handleProgressEvent(data) {
        if (data.status === 'error') {
            throw new Error(data.detail || 'Ingestion failed.');
        }
        
        if (data.status === 'success') {
            // Set all steps complete
            setStepComplete(stepParsing, indParsing, pbParsing, "Completed");
            setStepComplete(stepEmbedding, indEmbedding, pbEmbedding, "Completed");
            setStepComplete(stepIngestion, indIngestion, pbIngestion, "Completed");
            
            // Populate Success Stats
            resDocId.textContent = data.document_id;
            resChunks.textContent = data.chunks_count;
            resVectors.textContent = data.upserted_count;
            resTime.textContent = data.elapsed_seconds + 's';

            // Show results
            setTimeout(() => {
                loadingStepper.style.display = 'none';
                ingestResult.style.display = 'block';
                btnIngest.innerHTML = '<i class="ph ph-check"></i> Ingestion Successful';
                btnRemove.style.display = 'flex';
                showToast('Ingestion Success', `Successfully indexed ${data.chunks_count} chunks in ${data.elapsed_seconds}s.`, 'success');
                refreshStats();
            }, 800);
            return;
        }

        const stage = data.stage;
        const progress = data.progress || 0;

        if (stage === 'parsing') {
            setStepActive(stepParsing, indParsing);
            pbParsing.style.width = progress + '%';
            metaParsing.textContent = `Parsing: ${progress}%`;
            
            if (data.status === 'complete') {
                setStepComplete(stepParsing, indParsing, pbParsing, `Parsed ${data.total_chunks} chunks`);
            }
        } 
        else if (stage === 'embedding') {
            // Guarantee previous step is closed out
            if (!stepParsing.classList.contains('complete')) {
                setStepComplete(stepParsing, indParsing, pbParsing, 'Done');
            }
            
            setStepActive(stepEmbedding, indEmbedding);
            pbEmbedding.style.width = progress + '%';
            
            if (data.status === 'complete') {
                setStepComplete(stepEmbedding, indEmbedding, pbEmbedding, 'Complete');
            } else {
                metaEmbedding.textContent = `Embedding: ${data.current} / ${data.total} (${progress}%)`;
            }
        } 
        else if (stage === 'upserting') {
            // Guarantee previous steps are closed out
            if (!stepParsing.classList.contains('complete')) {
                setStepComplete(stepParsing, indParsing, pbParsing, 'Done');
            }
            if (!stepEmbedding.classList.contains('complete')) {
                setStepComplete(stepEmbedding, indEmbedding, pbEmbedding, 'Done');
            }
            
            setStepActive(stepIngestion, indIngestion);
            pbIngestion.style.width = progress + '%';
            
            if (data.status === 'complete') {
                setStepComplete(stepIngestion, indIngestion, pbIngestion, 'Complete');
            } else {
                if (data.status === 'pending') {
                    metaIngestion.textContent = 'Enqueuing...';
                } else {
                    metaIngestion.textContent = `Upserting: ${data.current} / ${data.total} (${progress}%)`;
                }
            }
        }
    }

    // Stepper Helper Functions
    function resetSteps() {
        const steps = [stepParsing, stepEmbedding, stepIngestion];
        const indicators = [indParsing, indEmbedding, indIngestion];
        const pbs = [pbParsing, pbEmbedding, pbIngestion];
        const metas = [metaParsing, metaEmbedding, metaIngestion];
        
        steps.forEach(step => step.className = 'step-item');
        indicators.forEach((ind, i) => {
            ind.innerHTML = (i + 1).toString();
        });
        pbs.forEach(pb => pb.style.width = '0%');
        metas.forEach(meta => meta.textContent = 'Waiting...');
    }

    function setStepActive(stepElement, indicatorElement) {
        if (!stepElement.classList.contains('active') && !stepElement.classList.contains('complete')) {
            stepElement.className = 'step-item active';
            indicatorElement.innerHTML = '<i class="ph ph-spinner step-spinner"></i>';
        }
    }

    // Custom tactical transitions
    function setStepComplete(stepElement, indicatorElement, pbElement, metaText) {
        stepElement.className = 'step-item complete';
        indicatorElement.innerHTML = '<i class="ph ph-check"></i>';
        if (pbElement) pbElement.style.width = '100%';
        
        const metaEl = stepElement.querySelector('.step-meta');
        if (metaEl && metaText) {
            metaEl.textContent = metaText;
        }
    }

    // Query Search Handler
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const queryVal = searchQuery.value.trim();
        if (!queryVal) return;

        btnSearch.disabled = true;
        btnSearch.innerHTML = '<i class="ph ph-spinner step-spinner"></i> Processing query...';
        resultsContainer.innerHTML = '';
        searchMeta.style.display = 'none';

        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(queryVal)}&top_k=5`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Search API failed.');
            }

            const data = await response.json();
            
            btnSearch.disabled = false;
            btnSearch.innerHTML = '<i class="ph ph-sparkle"></i> Search Index';

            if (data.results && data.results.length > 0) {
                resultsCount.textContent = data.results.length;
                searchMeta.style.display = 'flex';
                
                data.results.forEach((result, idx) => {
                    const score = result.score;
                    let badgeClass = 'low';
                    if (score > 0.8) badgeClass = 'high';
                    else if (score > 0.6) badgeClass = 'mid';

                    const card = document.createElement('div');
                    card.className = 'result-card';
                    card.style.animation = `form-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.05}s both`;
                    card.innerHTML = `
                        <div class="result-card-header">
                            <span class="result-filename">
                                <i class="ph ph-file-text"></i> ${result.metadata.filename || 'Unknown Document'}
                            </span>
                            <span class="score-badge ${badgeClass}">Relevance: ${(score * 100).toFixed(1)}%</span>
                        </div>
                        <div class="result-text">${highlightText(result.metadata.text || '', queryVal)}</div>
                    `;
                    resultsContainer.appendChild(card);
                });
                showToast('Query Completed', `Retrieved ${data.results.length} relevant segments from index.`, 'success');
            } else {
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <i class="ph ph-info no-results-icon"></i>
                        <p>${data.message || 'No matching document text chunks found in your database.'}</p>
                    </div>
                `;
                showToast('Query Completed', 'No matches found.', 'info');
            }

        } catch (error) {
            btnSearch.disabled = false;
            btnSearch.innerHTML = '<i class="ph ph-sparkle"></i> Search Index';
            resultsContainer.innerHTML = `
                <div class="no-results" style="color: var(--error);">
                    <i class="ph ph-warning no-results-icon"></i>
                    <p>Search failed: ${error.message}</p>
                </div>
            `;
            showToast('Search Failed', error.message, 'error');
        }
    });

    // Highlight query terms inside the matching text blocks
    function highlightText(text, query) {
        if (!query) return escapeHtml(text);
        
        // Stopwords to ignore from highlighting
        const stopwords = new Set([
            'the', 'and', 'a', 'of', 'in', 'to', 'for', 'is', 'on', 'that', 'this', 'with', 'as', 'at', 'by', 'an', 'be', 'or', 'are', 'it', 'from'
        ]);
        
        // Entity references to avoid highlight collisions (prevents corruption of e.g. &amp;)
        const entityNames = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
        
        const terms = query
            .toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
            .split(/\s+/)
            .filter(t => t.length > 2 && !stopwords.has(t) && !entityNames.has(t));
            
        let escapedText = escapeHtml(text);
        if (terms.length === 0) return escapedText;
        
        // Sort by length desc to highlight longer match sequences first
        terms.sort((a, b) => b.length - a.length);
        
        // Escape terms for Regex matching
        const escapedTerms = terms.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        
        const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
        return escapedText.replace(regex, '<mark class="matched-term">$1</mark>');
    }

    // Helper to safely escape HTML output
    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
