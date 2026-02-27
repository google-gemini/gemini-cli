document.addEventListener('DOMContentLoaded', () => {
    const presentationContainer = document.getElementById('presentation-container');
    const nextButton = document.getElementById('next-slide');
    const prevButton = document.getElementById('prev-slide');

    const slidesData = [
        {
            title: "$10 Billion Investment in Binance",
            subtitle: "Proposal for Qatar Investment Authority",
            content: "<p>Prepared by: Sheikh Jabr bin Thani Al Thani (Owner, The Ark Investment Co.)</p>"
        },
        {
            title: "Executive Summary",
            content: "<p>Doha’s skyline symbolizes Qatar’s ambition to diversify its investments globally. Qatar Investment Authority (QIA), the sovereign wealth fund of Qatar, is evaluating a strategic $10 billion equity investment in Binance, the world’s largest cryptocurrency exchange. This partnership would marry Qatar’s robust capital resources with Binance’s fintech leadership, generating mutual benefits in technology, finance, and innovation. By investing in Binance, QIA can accelerate its diversification into digital assets and fintech, positioning Qatar at the forefront of the crypto economy. Meanwhile, Binance would gain a long-term strategic partner, strengthening its capital base and global reach.</p>"
        },
        {
            title: "Binance – Leading Global Crypto Exchange",
            content: "<p>Binance’s logo, representing its prominent role in the crypto industry. Binance is the world’s largest cryptocurrency exchange, with over 270 million registered users across 180+ countries. In 2024, Binance facilitated an astounding $100 trillion in crypto trading volume, reflecting its dominant market share. The platform has secured regulatory authorizations in 21 jurisdictions and built a 650-member compliance team to ensure security and trust. Binance’s expansive ecosystem – from trading and lending to education and charity – underscores its position as a leader driving the global adoption of digital assets.</p>"
        },
        {
            title: "Strategic Rationale for Qatar (QIA)",
            content: "<ul><li>Technology & Innovation: Gaining exposure to the cutting-edge blockchain and fintech industry via the world’s top crypto platform.</li><li>Portfolio Diversification: Reducing reliance on traditional assets (oil & gas, real estate) by adding high-growth digital economy assets.</li><li>Strategic Partnership: Building a long-term partnership with a global tech leader, potentially unlocking co-investment opportunities and knowledge transfer in blockchain initiatives.</li><li>Global Influence: Enhancing Qatar’s presence in the digital finance space, complementing its investments in AI, tech startups, and venture capital.</li></ul>"
        },
        {
            title: "Benefits for Binance",
            content: "<ul><li>Growth Capital: A $10 billion equity infusion enables Binance to accelerate expansion, product development, and global acquisitions.</li><li>Long-Term Partnership: QIA is a patient, long-term investor, providing stability and reducing reliance on short-term private investors.</li><li>Credibility & Trust: Backing by Qatar’s sovereign fund boosts Binance’s credibility with regulators and traditional financial institutions, signaling confidence in Binance’s compliance and longevity.</li><li>Strategic Market Access: Qatar’s support can facilitate Binance’s entry and operations in new markets (especially across the Middle East and emerging economies), leveraging Qatar’s diplomatic and economic networks.</li></ul>"
        },
        {
            title: "Proposed Investment Structure",
            content: "<ul><li>Equity Stake: QIA to invest $10 billion in exchange for an equity stake in Binance (approximately 15% ownership, subject to due diligence and valuation agreement).</li><li>Governance: QIA to receive representation on Binance’s board of directors, commensurate with its stake, to participate in major strategic decisions.</li><li>Use of Proceeds: Binance will allocate the capital toward global expansion, technology R&D, regulatory compliance strengthening, and potential strategic acquisitions, driving further growth.</li><li>Strategic Initiatives: Binance agrees to consider establishing a regional headquarters or innovation hub in Qatar, supporting the nation’s fintech sector development and creating high-skilled jobs.</li></ul>"
        },
        {
            title: "Sheikh Jabr bin Thani Al Thani & The Ark Investment Co.",
            content: "<ul><li>Sheikh Jabr bin Thani Al Thani: A prominent Qatari investor and member of the Al Thani royal family. He has a track record of supporting innovative ventures and bridging international business opportunities.</li><li>The Ark Investment Co.: A private investment company owned by Sheikh Jabr. The firm has a diversified portfolio spanning technology, real estate, and finance, and serves as a vehicle for strategic investments in high-growth opportunities. The Ark Investment Co. is the proponent of this Binance investment proposal, reflecting Sheikh Jabr’s confidence in the crypto sector’s potential.</li></ul>"
        },
        {
            title: "Risks & Mitigations",
            content: "<ul><li>Regulatory Risk: Cryptocurrencies face regulatory uncertainty, and Binance has encountered legal challenges (e.g., a $4.3 billion settlement with U.S. regulators in 2023). Mitigation: Binance has significantly bolstered its compliance efforts (650+ compliance staff, 21 licensed jurisdictions), and QIA’s investment could further encourage a strong governance and compliance framework.</li><li>Market Volatility: The crypto market is highly volatile, which could impact Binance’s revenues and valuation. Mitigation: QIA’s investment horizon is long-term, allowing it to weather short-term market swings. Additionally, Binance’s diversified services (exchange fees, cloud, education, etc.) provide multiple revenue streams that cushion against downturns in trading activity.</li><li>Reputational Risk: Association with a crypto firm could pose image risks to Qatar if the industry faces crises. Mitigation: By investing in a market leader with a proven track record, QIA can set a positive example for industry standards. Thorough due diligence and ongoing oversight (via the board seat) will ensure Binance maintains best practices aligning with Qatar’s reputation.</li></ul>"
        },
        {
            title: "Potential Returns & Exit Strategy",
            content: "<ul><li>High Growth Potential: Binance’s revenues and user base have been growing rapidly (the platform added 50 million users in the second half of 2024 alone). Continued global crypto adoption could significantly increase Binance’s valuation, potentially doubling or more in the next 5 years.</li><li>Projected ROI: If Binance’s valuation grows at a conservative 15% annually, QIA’s $10B investment could be worth approximately $20B in five years (excluding any dividends), yielding a strong double-digit annual return.</li><li>Exit Opportunities: QIA can realize returns via a future IPO or public listing of Binance, strategic sale of its stake, or through dividends once Binance matures. An eventual public offering could unlock liquidity and allow QIA to partially or fully exit at a substantial profit.</li><li>Strategic Dividends: As a significant shareholder, QIA would benefit if Binance initiates profit-sharing or special dividends once regulatory uncertainties settle and cash flows stabilize.</li></ul>"
        },
        {
            title: "Conclusion & Next Steps",
            content: "<ul><li>Mutual Opportunity: This investment positions Qatar as a key player in the digital finance revolution while providing Binance with growth capital and a prestigious partner. It is a win–win alliance aligning with Qatar’s vision and Binance’s expansion goals.</li><li>Timing: With the global crypto market maturing and competitors seeking strategic partners, now is an opportune moment for QIA to secure a stake in Binance at an attractive valuation.</li><li>Next Steps: Initiate formal due diligence on Binance’s financials and regulatory compliance. Upon satisfactory review, proceed to negotiate detailed terms and obtain approvals from QIA’s Board and the State of Qatar for the investment.</li><li>Commitment: Sheikh Jabr bin Thani Al Thani and The Ark Investment Co. are ready to facilitate discussions and support a smooth partnership process. We look forward to QIA’s feedback and the opportunity to move forward with this landmark investment.</li></ul><p>Sources: Binance company reports and user statistics; Qatar Investment Authority strategic focus; Reuters news on recent Binance investments and compliance settlements.</p>"
        }
    ];

    let currentSlideIndex = 0;

    function renderSlides() {
        presentationContainer.innerHTML = ''; // Clear existing slides
        slidesData.forEach((slideData, index) => {
            const slideElement = document.createElement('div');
            slideElement.classList.add('slide');
            slideElement.id = `slide-${index}`;

            let slideHTML = '';
            if (slideData.title) {
                slideHTML += `<h1>${slideData.title}</h1>`;
            }
            if (slideData.subtitle) {
                slideHTML += `<h2>${slideData.subtitle}</h2>`;
            }
            slideHTML += slideData.content;
            slideElement.innerHTML = slideHTML;

            if (index === currentSlideIndex) {
                slideElement.classList.add('active');
            }
            presentationContainer.appendChild(slideElement);
        });
        updateNavButtons();
    }

    function showSlide(index) {
        const slides = document.querySelectorAll('.slide');
        slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });
        currentSlideIndex = index;
        updateNavButtons();
    }

    function updateNavButtons() {
        prevButton.disabled = currentSlideIndex === 0;
        nextButton.disabled = currentSlideIndex === slidesData.length - 1;
    }

    nextButton.addEventListener('click', () => {
        if (currentSlideIndex < slidesData.length - 1) {
            showSlide(currentSlideIndex + 1);
        }
    });

    prevButton.addEventListener('click', () => {
        if (currentSlideIndex > 0) {
            showSlide(currentSlideIndex - 1);
        }
    });

    // Initial render
    renderSlides();

    // Placeholder for SVG morphing setup
    // This is where we would initialize the SVG and the morphing library
    const svgContainer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgContainer.setAttribute('id', 'morphing-svg-container');
    svgContainer.setAttribute('viewBox', '0 0 1000 600'); // Match container aspect ratio
    svgContainer.setAttribute('preserveAspectRatio', 'none');

    const morphPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    morphPath.setAttribute('id', 'morph-path');
    // Initial path - can be a simple rectangle or a more complex shape
    morphPath.setAttribute('d', 'M0,0 L1000,0 L1000,600 L0,600 Z');

    svgContainer.appendChild(morphPath);
    // Insert SVG container into the presentation container, but behind slides
    if (presentationContainer.firstChild) {
        presentationContainer.insertBefore(svgContainer, presentationContainer.firstChild);
    } else {
        presentationContainer.appendChild(svgContainer);
    }

    // TODO: Integrate a morphing library like GSAP with MorphSVGPlugin or Anime.js
    // And define path data for each slide transition.
    // console.log("Basic slide structure and navigation set up. SVG morphing to be implemented.");

    // --- SVG Morphing with Anime.js ---
    const morphPathElement = document.getElementById('morph-path');
    const slideCount = slidesData.length;

    // Define a series of SVG path 'd' attributes for morphing.
    // These are just examples; more complex and varied paths can be designed.
    // Dimensions are based on viewBox="0 0 1000 600"
    const morphPaths = [
        "M0,0 L1000,0 L1000,600 L0,600 Z", // Full rectangle (initial)
        "M0,0 Q500,150 1000,0 L1000,600 Q500,450 0,600 Z", // Wavy top and bottom
        "M0,300 Q250,0 500,300 T1000,300 L1000,600 L0,600 Z", // Blob from top-middle
        "M500,0 L1000,300 L500,600 L0,300 Z", // Diamond shape
        "M0,0 L1000,0 L1000,300 Q500,600 0,300 Z", // Curve from bottom center
        "M0,0 L500,0 Q250,300 500,600 L0,600 Z", // Left half curve
        "M1000,0 L500,0 Q750,300 500,600 L1000,600 Z", // Right half curve
        "M10,10 L990,10 L990,590 L10,590 Z", // Inner smaller rectangle
        "M0,150 C150,0 450,0 500,150 S850,300 1000,150 L1000,600 L0,600 Z", // Complex curve top
        "M500,300 m-200,0 a200,200 0 1,0 400,0 a200,200 0 1,0 -400,0 Z" // Circle in center
    ];

    // Ensure there's a path for each slide or cycle through them
    const getPathForSlide = (index) => {
        return morphPaths[index % morphPaths.length];
    };

    // Set initial path
    if (morphPathElement) {
        morphPathElement.setAttribute('d', getPathForSlide(0));
    }

    function animateMorph(newPath) {
        if (morphPathElement && typeof anime === 'function') {
            anime({
                targets: morphPathElement,
                d: newPath,
                duration: 800, // Duration of the morph animation
                easing: 'easeInOutQuad' // Easing function for smooth transition
            });
        }
    }

    // Override showSlide to include morphing
    const originalShowSlide = showSlide;
    showSlide = (index) => {
        originalShowSlide(index); // Call the original slide display logic
        if (morphPathElement) {
            const newPath = getPathForSlide(index);
            animateMorph(newPath);
        }
    };
    // --- End SVG Morphing with Anime.js ---

});
