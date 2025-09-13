// 全局数据和图表实例
let allData = []; // 存储基于 createdAt 聚合的数据
let snapshotData = []; // 存储基于文件日期的快照数据
let newReviewsTrendChart = null; // 新增评论趋势图表
let totalReviewsSnapshotChart = null; // 总数快照趋势图表
let flatpickrInstance = null;

// 获取 DOM 元素
const loadingOverlay = document.getElementById('loading-overlay');
const mainContent = document.querySelector('.main-content');
const productIdInput = document.getElementById('productId');
const topReviewsOnlyCheckbox = document.getElementById('topReviewsOnly');
const dateRangeInput = document.getElementById('dateRange');
const productSummaryTableBody = document.querySelector('.product-summary-section table tbody');
const reviewsContainer = document.querySelector('.reviews-container');
const instructionTooltip = document.getElementById('instruction-tooltip');
const reviewCountDisplay = document.getElementById('review-count-display');
const filterStatusDisplay = document.getElementById('filter-status-display');
const csvFileInput = document.getElementById('csvFileInput');
const initialStateDiv = document.getElementById('initial-state');
const mainAppContentDiv = document.getElementById('main-app-content');

// 显示加载指示器
function showLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('show');
}

// 隐藏加载指示器
function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('show');
}

// CSV 解析函数
async function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.error('PapaParse errors:', results.errors);
                    reject(new Error('CSV parsing errors occurred.'));
                }
                resolve(results.data);
            },
            error: (error) => reject(error)
        });
    });
}

// 处理文件选择
async function handleFileSelect(event) {
    showLoading();
    try {
        const files = event.target.files;
        let allRawReviews = [];
        const processedReviewIds = new Set();
        snapshotData = []; // 清空旧快照数据

        const datedFiles = Array.from(files)
            .map(file => {
                const match = file.name.match(/(\d{8})/);
                return { file, date: match ? moment(match[1], 'YYYYMMDD') : null };
            })
            .filter(f => f.date && f.date.isValid())
            .sort((a, b) => a.date.diff(b.date));

        for (const { file, date } of datedFiles) {
            const parsedData = await parseCSV(file);
            
            // 1. 计算快照数据
            let totalReviews = parsedData.length;
            let topReviews = parsedData.filter(row => row.reviewerRank && row.reviewerRank.trim() !== '').length;
            snapshotData.push({
                date: date.format('YYYY-MM-DD'),
                totalReviews,
                topReviews
            });

            // 2. 收集所有原始评论用于新增趋势计算
            parsedData.forEach(row => {
                if (row.reviewId && !processedReviewIds.has(row.reviewId)) {
                    allRawReviews.push(row);
                    processedReviewIds.add(row.reviewId);
                }
            });
        }

        // 3. 聚合计算每日新增评论
        const aggregatedMap = new Map();
        allRawReviews.forEach(row => {
            const createdAtDate = row.createdAt ? row.createdAt.split(' ')[0] : '1970-01-01';
            if (!moment(createdAtDate, 'YYYY-MM-DD').isValid()) return;

            const productId = row.productId || 'N/A';
            const key = `${createdAtDate}-${productId}`;

            if (!aggregatedMap.has(key)) {
                aggregatedMap.set(key, {
                    date: createdAtDate,
                    productId: productId,
                    totalReviews: 0,
                    topReviews: 0,
                    itemName: row.itemName || '未知商品',
                    reviews: []
                });
            }

            const entry = aggregatedMap.get(key);
            entry.totalReviews += 1;
            if (row.reviewerRank && row.reviewerRank.trim() !== '') {
                entry.topReviews += 1;
            }
            entry.reviews.push({
                reviewId: row.reviewId,
                rating: parseInt(row.rating) || 0,
                content: row.content || '',
                helpfulTrueCount: parseInt(row.helpfulTrueCount) || 0,
                attachments: row.attachments || '[]',
                createdAt: row.createdAt,
                displayName: row.displayName || '익명',
                vendorName: row.vendorName || '정보 없음',
                reviewerRank: row.reviewerRank || ''
            });
        });

        allData = Array.from(aggregatedMap.values());

        if (allData.length === 0 && snapshotData.length === 0) {
            console.warn('No data was processed from CSV files');
            return;
        }

        // 更新日期选择器范围
        updateFlatpickrRange();
        
        renderPage();

        // 显示主应用内容，隐藏初始状态
        if (initialStateDiv) initialStateDiv.classList.add('hidden');
        if (mainAppContentDiv) mainAppContentDiv.classList.remove('hidden');

    } catch (error) {
        console.error('文件处理失败:', error);
        if (mainContent) {
            mainContent.innerHTML = `<p class="error-message">文件处理失败：${error.message}。</p>`;
        }
    } finally {
        hideLoading();
    }
}

function updateFlatpickrRange() {
    const allDates = [
        ...allData.map(item => new Date(item.date)),
        ...snapshotData.map(item => new Date(item.date))
    ].filter(date => !isNaN(date.getTime()));

    if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(Math.max(...allDates));
        if (flatpickrInstance) {
            flatpickrInstance.set('minDate', minDate);
            flatpickrInstance.set('maxDate', maxDate);
            flatpickrInstance.setDate([minDate, maxDate], true);
        }
    }
}

// DOMContentLoaded 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('csvUploadBtn').addEventListener('click', () => {
        csvFileInput.click();
    });
    csvFileInput.addEventListener('change', handleFileSelect);

    flatpickrInstance = flatpickr(dateRangeInput, {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: "zh",
        onChange: () => renderPage() // 恢复简单、统一的 onChange 触发
    });

    initializeNewReviewsChart();
    initializeSnapshotChart();

    productIdInput.addEventListener('input', debounce(renderPage, 300));
    topReviewsOnlyCheckbox.addEventListener('change', renderPage);
});

// 初始化图表
function initializeChart(canvasId, onClickHandler) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { 
                    unit: 'day',
                    tooltipFormat: 'YYYY-MM-DD',
                    displayFormats: {
                        day: 'MMM D',
                        week: 'MMM D',
                        month: 'YYYY MMM'
                    }
                },
                ticks: {
                    autoSkip: true,
                    maxTicksLimit: 15 
                }
            },
            y: { 
                beginAtZero: true,
                ticks: {
                    stepSize: 1, // 确保Y轴刻度为整数
                    callback: function(value) {
                        if (Math.floor(value) === value) {
                            return value;
                        }
                    }
                }
            }
        },
        plugins: {
            tooltip: {
                mode: 'index',
                intersect: false,
            }
        }
    };

    if (onClickHandler) {
        chartOptions.onClick = onClickHandler;
    }

    return new Chart(ctx, {
        type: 'line',
        data: { 
            labels: [], 
            datasets: [
                { label: '每日总评论数', data: [], borderColor: '#007bff', fill: false, tension: 0.1 },
                { label: '每日TOP评论数', data: [], borderColor: '#28a745', fill: false, tension: 0.1 }
            ]
        },
        options: chartOptions
    });
}

function initializeNewReviewsChart() {
    newReviewsTrendChart = initializeChart('newReviewsTrendChart', (event) => {
        const points = newReviewsTrendChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
        if (points.length) {
            const firstPoint = points[0];
            const label = newReviewsTrendChart.data.labels[firstPoint.index];
            const clickedDate = moment(label);
            
            // 筛选并只显示那一天的评论
            filterAndDisplayReviewsForDate(clickedDate);
        }
    });
}

function initializeSnapshotChart() {
    totalReviewsSnapshotChart = initializeChart('totalReviewsSnapshotChart');
}

// 主渲染函数
function renderPage() {
    console.log(`[调试] 开始渲染页面 (renderPage)...`);
    showLoading();
    try {
        const productIdFilter = productIdInput.value.trim();
        const selectedDates = flatpickrInstance.selectedDates;
        if (selectedDates.length < 2) {
             hideLoading();
             return;
        }
        const startDate = moment(selectedDates[0]).startOf('day');
        const endDate = moment(selectedDates[1]).endOf('day');
        console.log(`[调试] renderPage 使用的日期范围: ${startDate.format('YYYY-MM-DD')} 至 ${endDate.format('YYYY-MM-DD')}`);

        // 筛选新增评论数据
        const filteredNewReviewsData = allData.filter(item => {
            const itemDate = moment(item.date);
            const dateMatch = itemDate.isBetween(startDate, endDate, 'day', '[]');
            const productMatch = !productIdFilter || item.productId.includes(productIdFilter);
            return dateMatch && productMatch;
        });
        console.log(`[调试] 筛选后 "新增评论" 数据条数: ${filteredNewReviewsData.length}`);

        // 筛选快照数据
        const filteredSnapshotData = snapshotData.filter(item => {
            const itemDate = moment(item.date);
            return itemDate.isBetween(startDate, endDate, 'day', '[]');
        });
        console.log(`[调试] 筛选后 "快照" 数据条数: ${filteredSnapshotData.length}`);

        updateNewReviewsChart(filteredNewReviewsData, startDate, endDate);
        updateSnapshotChart(filteredSnapshotData, startDate, endDate);
        
        const allFilteredReviews = filteredNewReviewsData.flatMap(item => item.reviews.map(review => ({...review, productId: item.productId, itemName: item.itemName})));
        const topReviewsOnly = topReviewsOnlyCheckbox.checked;
        const reviewsToRender = topReviewsOnly
            ? allFilteredReviews.filter(r => r.reviewerRank && r.reviewerRank.trim() !== '')
            : allFilteredReviews;
        
        updateProductSummaryTable(filteredNewReviewsData);
        updateDetailedReviews(reviewsToRender);

        // 清除特定日期筛选状态
        filterStatusDisplay.innerHTML = '';

    } catch (error) {
        console.error('Error in renderPage:', error);
    } finally {
        hideLoading();
    }
}

// 根据日期范围获取最佳的图表时间单位
function getChartTimeUnit(startDate, endDate) {
    const diffDays = endDate.diff(startDate, 'days');
    if (diffDays > 90) return 'month';
    if (diffDays > 30) return 'week';
    return 'day';
}

// 更新图表
function updateChart(chart, data, dateRange, totalKey, topKey) {
    // 动态调整时间单位
    const timeUnit = getChartTimeUnit(dateRange.startDate, dateRange.endDate);
    chart.options.scales.x.time.unit = timeUnit;

    const dailyCounts = {};
    for (let m = dateRange.startDate.clone(); m.isSameOrBefore(dateRange.endDate, 'day'); m.add(1, 'days')) {
        const dateKey = m.format('YYYY-MM-DD');
        dailyCounts[dateKey] = { total: 0, top: 0 };
    }

    data.forEach(item => {
        const dateKey = moment(item.date).format('YYYY-MM-DD');
        if (dailyCounts[dateKey]) {
            dailyCounts[dateKey].total += item[totalKey];
            dailyCounts[dateKey].top += item[topKey];
        }
    });

    const sortedDates = Object.keys(dailyCounts).sort();
    const totalData = sortedDates.map(date => dailyCounts[date].total);
    const topData = sortedDates.map(date => dailyCounts[date].top);

    console.log(`[调试] 更新图表 ${chart.canvas.id}:`, {
        labels: sortedDates,
        totalData: totalData,
        topData: topData
    });

    chart.data.labels = sortedDates;
    chart.data.datasets[0].data = totalData;
    chart.data.datasets[1].data = topData;
    chart.update();
}

function updateNewReviewsChart(items, startDate, endDate) {
    updateChart(newReviewsTrendChart, items, {startDate, endDate}, 'totalReviews', 'topReviews');
}

function updateSnapshotChart(items, startDate, endDate) {
    updateChart(totalReviewsSnapshotChart, items, {startDate, endDate}, 'totalReviews', 'topReviews');
}

// 更新产品汇总
function updateProductSummaryTable(items) {
    if (!productSummaryTableBody) return;
    const productCounts = items.reduce((acc, item) => {
        acc[item.productId] = (acc[item.productId] || 0) + item.reviews.length;
        return acc;
    }, {});
    const sortedProducts = Object.entries(productCounts).sort(([, a], [, b]) => b - a);
    
    productSummaryTableBody.innerHTML = sortedProducts.length 
        ? sortedProducts.map(([id, count]) => `<tr data-product-id="${id}"><td>${id}</td><td>${count}</td></tr>`).join('') 
        : '<tr><td colspan="2">无数据</td></tr>';

    // 为每一行添加点击事件监听器
    productSummaryTableBody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const productId = row.dataset.productId;
            if (!productId) return;

            // 移除其他行的选中状态
            productSummaryTableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
            
            // 如果当前筛选的就是这个产品ID，则取消筛选
            if (productIdInput.value === productId) {
                productIdInput.value = '';
            } else {
                productIdInput.value = productId;
                row.classList.add('selected');
            }
            
            renderPage();
        });
    });
}

// 更新详细评论
function filterAndDisplayReviewsForDate(targetDate) {
    showLoading();
    try {
        const productIdFilter = productIdInput.value.trim();
        const topReviewsOnly = topReviewsOnlyCheckbox.checked;

        const reviewsForDate = allData
            .filter(item => {
                const itemDate = moment(item.date);
                const productMatch = !productIdFilter || item.productId.includes(productIdFilter);
                return itemDate.isSame(targetDate, 'day') && productMatch;
            })
            .flatMap(item => item.reviews.map(review => ({...review, productId: item.productId, itemName: item.itemName})));

        const reviewsToRender = topReviewsOnly
            ? reviewsForDate.filter(r => r.reviewerRank && r.reviewerRank.trim() !== '')
            : reviewsForDate;

        updateDetailedReviews(reviewsToRender);

        // 显示筛选状态
        filterStatusDisplay.innerHTML = `[正在显示 ${targetDate.format('YYYY-MM-DD')} 的评论 <button id="clear-date-filter">x</button>]`;
        document.getElementById('clear-date-filter').addEventListener('click', () => {
            renderPage();
        });

    } catch (error) {
        console.error('Error in filterAndDisplayReviewsForDate:', error);
    } finally {
        hideLoading();
    }
}

// 更新详细评论
function updateDetailedReviews(reviews) {
    if (!reviewsContainer || !reviewCountDisplay) return;
    const topReviewsCount = reviews.filter(r => r.reviewerRank && r.reviewerRank.trim() !== '').length;
    reviewCountDisplay.textContent = `${reviews.length} 条评论 (${topReviewsCount} 条TOP评论)`;
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const fragment = document.createDocumentFragment();
    if (reviews.length === 0) {
        reviewsContainer.innerHTML = '<p>没有找到符合条件的评论。</p>';
    } else {
        reviews.forEach(review => {
            const reviewItem = document.createElement('div');
            reviewItem.className = 'review-item';
            const topBadge = review.reviewerRank ? `<span class="top-reviewer-badge">${review.reviewerRank}</span>` : '';
            const attachments = (JSON.parse(review.attachments || '[]').map(att => `<img src="${att.imgSrcOrigin}" loading="lazy">`).join(''));
            reviewItem.innerHTML = `
                <div class="review-author-info">
                    <span class="review-author-name">${review.displayName || '익명'} ${topBadge}</span>
                    <span class="review-date">${moment(review.createdAt).format('YYYY.MM.DD')}</span>
                </div>
                <div class="review-product-info"><p>${review.itemName}</p><p><strong>판매자:</strong> ${review.vendorName || '정보 없음'}</p></div>
                <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - (review.rating || 0))}</div>
                ${attachments ? `<div class="review-attachments">${attachments}</div>` : ''}
                <p class="review-content">${review.content || '无'}</p>
                <div class="review-footer"><span class="review-id">ID: ${review.reviewId}</span><span class="helpful-count">👍 ${review.helpfulTrueCount || 0}</span></div>
            `;
            fragment.appendChild(reviewItem);
        });
        reviewsContainer.innerHTML = '';
        reviewsContainer.appendChild(fragment);
    }
}

// 防抖函数
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
