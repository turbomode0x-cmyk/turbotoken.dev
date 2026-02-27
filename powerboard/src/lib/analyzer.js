/**
 * Meme Coin Analyzer
 * Implements the three-pillar evaluation framework for Solana meme coins
 */

/**
 * Analyze volume patterns to detect fake vs organic activity
 */
export function analyzeVolume(tokenData) {
  const { volume, transactions, fees } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let score = 5; // Neutral starting point
  let status = "UNKNOWN";
  
  // Check for fake volume patterns
  if (transactions?.sells) {
    const sameTimestampSells = transactions.sells.filter((sell, idx, arr) => 
      arr.filter(s => s.timestamp === sell.timestamp).length > 3
    );
    
    if (sameTimestampSells.length > 0) {
      redFlags.push(`${sameTimestampSells.length} sells at exact same timing`);
      score += 2;
    }
  }
  
  // Check for repeated wallet trading
  if (transactions?.repeatedWallets && transactions.repeatedWallets > 5) {
    redFlags.push("One wallet repeatedly trading");
    score += 1;
  }
  
  // Check fees - low fees suggest artificial market making
  if (fees && volume) {
    const feeRatio = fees / volume;
    if (feeRatio < 0.001) {
      redFlags.push("Disproportionately low fees = artificial market making");
      score += 1.5;
    } else if (feeRatio > 0.01) {
      greenFlags.push("High fees indicate real organic volume");
      score -= 1;
    }
  }
  
  // Check for random amounts (organic sign)
  if (transactions?.hasRandomAmounts) {
    greenFlags.push("Random transaction amounts detected (organic activity)");
    score -= 1.5;
  }
  
  // Determine status
  if (score >= 7) {
    status = "SUSPICIOUS";
  } else if (score >= 5) {
    status = "MIXED";
  } else {
    status = "ORGANIC";
  }
  
  return {
    score: Math.min(10, Math.max(1, Math.round(score))),
    status,
    details: redFlags.length > 0 
      ? `Volume appears ${status.toLowerCase()} - ${redFlags[0]}`
      : greenFlags.length > 0
      ? "Volume shows signs of organic activity"
      : "Insufficient data to determine volume quality",
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Analyze narrative strength and social momentum
 */
export function analyzeNarrative(tokenData) {
  const { social, narrative } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let score = 5;
  let status = "UNKNOWN";
  
  // Check social media metrics
  if (social) {
    if (!social.xFollowers || social.xFollowers < 100) {
      redFlags.push("No social momentum");
      score += 2;
    } else if (social.xFollowers > 1000) {
      greenFlags.push(`Strong follower base: ${social.xFollowers}`);
      score -= 1;
    }
    
    if (social.postsPerHour !== undefined) {
      if (social.postsPerHour < 0.5) {
        redFlags.push("Dead X account");
        score += 1.5;
      } else if (social.postsPerHour > 2) {
        greenFlags.push("Active social engagement");
        score -= 1;
      }
    }
    
    if (!social.kolInvolvement || social.kolInvolvement === "None detected") {
      redFlags.push("No KOL engagement");
      score += 1;
    } else {
      greenFlags.push(`KOL involvement: ${social.kolInvolvement}`);
      score -= 1.5;
    }
  }
  
  // Check narrative alignment
  if (narrative) {
    if (!narrative.relevant || !narrative.trending) {
      redFlags.push("No clear narrative alignment with current market trends");
      score += 1.5;
    } else {
      greenFlags.push("Narrative aligned with current market conditions");
      score -= 1;
    }
  }
  
  // Determine status
  if (score >= 7) {
    status = "WEAK";
  } else if (score >= 5) {
    status = "MODERATE";
  } else {
    status = "STRONG";
  }
  
  return {
    score: Math.min(10, Math.max(1, Math.round(score))),
    status,
    details: redFlags.length > 0
      ? `Narrative ${status.toLowerCase()} - ${redFlags[0]}`
      : greenFlags.length > 0
      ? "Strong narrative and social momentum detected"
      : "Insufficient data to evaluate narrative",
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Analyze distribution patterns for rug risk
 */
export function analyzeDistribution(tokenData) {
  const { distribution, holders } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let score = 5;
  let status = "UNKNOWN";
  
  // Check for bundle pattern
  if (distribution?.topHolders) {
    const percentages = distribution.topHolders.map(h => h.percentage).sort((a, b) => b - a);
    const isBundlePattern = percentages.length >= 4 && 
      percentages.slice(0, 4).every((p, i, arr) => 
        i === 0 || (arr[i-1] - p < 0.5 && arr[i-1] - p > 0.1)
      );
    
    if (isBundlePattern) {
      const bundleTotal = percentages.slice(0, 4).reduce((a, b) => a + b, 0);
      redFlags.push(`Bundle pattern detected: ${percentages.slice(0, 4).map(p => `${p.toFixed(2)}%`).join(', ')}`);
      score += 3;
      
      if (bundleTotal > 30) {
        redFlags.push(`Heavy bundles (${bundleTotal.toFixed(1)}%) = HIGH RUG RISK`);
        score += 2;
      }
    }
  }
  
  // Check for fresh wallets
  if (distribution?.freshWallets) {
    const freshCount = distribution.freshWallets;
    if (freshCount > 15) {
      redFlags.push(`First ${freshCount} wallets are all fresh (green leaves) - likely rug`);
      score += 2.5;
    }
  }
  
  // Check holder count
  if (holders) {
    if (holders.count < 50) {
      redFlags.push("Very low holder count");
      score += 1;
    } else if (holders.count > 500) {
      greenFlags.push(`Good distribution: ${holders.count} holders`);
      score -= 1;
    }
  }
  
  // Determine status
  if (score >= 8) {
    status = "CRITICAL";
  } else if (score >= 6) {
    status = "SUSPICIOUS";
  } else if (score >= 4) {
    status = "MODERATE";
  } else {
    status = "GOOD";
  }
  
  return {
    score: Math.min(10, Math.max(1, Math.round(score))),
    status,
    details: redFlags.length > 0
      ? `Distribution ${status.toLowerCase()} - ${redFlags[0]}`
      : greenFlags.length > 0
      ? "Good distribution detected"
      : "Insufficient data to evaluate distribution",
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Analyze liquidity and exitability
 */
export function analyzeLiquidity(tokenData) {
  const { marketCap, liquidity } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let status = "UNKNOWN";
  
  if (!marketCap || !liquidity) {
    return {
      market_cap: marketCap || 0,
      liquidity: liquidity || 0,
      liquidity_ratio: 0,
      status: "UNKNOWN",
      details: "Insufficient data to analyze liquidity",
      red_flags: [],
      green_flags: []
    };
  }
  
  const liquidityRatio = liquidity / marketCap;
  
  if (liquidityRatio < 0.1) {
    status = "DANGEROUS";
    redFlags.push("Liquidity too low for market cap size - cannot exit large positions");
  } else if (liquidityRatio < 0.2) {
    status = "RISKY";
    redFlags.push("Low liquidity relative to market cap");
  } else if (liquidityRatio >= 0.5) {
    status = "SAFE";
    greenFlags.push("Adequate liquidity for market cap size");
  } else {
    status = "MODERATE";
  }
  
  return {
    market_cap: marketCap,
    liquidity: liquidity,
    liquidity_ratio: liquidityRatio,
    status,
    details: liquidityRatio < 0.2
      ? `Only ${(liquidityRatio * 100).toFixed(1)}% liquidity relative to market cap - exit risk`
      : `Liquidity ratio: ${(liquidityRatio * 100).toFixed(1)}%`,
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Analyze security and contract safety
 */
export function analyzeSecurity(tokenData) {
  const { security, devWallet } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let status = "UNKNOWN";
  let score = 5;
  
  // Check contract renunciation
  if (security?.contractRenounced !== undefined) {
    if (!security.contractRenounced) {
      redFlags.push("Contract not renounced");
      score += 3;
    } else {
      greenFlags.push("Contract renounced");
      score -= 2;
    }
  }
  
  // Check dev wallet history
  if (devWallet) {
    if (devWallet.previousCoins > 0 && devWallet.migratedCoins === 0) {
      redFlags.push(`Dev wallet: ${devWallet.previousCoins} previous coins, 0 migrated`);
      score += 2;
    } else if (devWallet.migratedCoins > 0) {
      greenFlags.push(`Dev has ${devWallet.migratedCoins} successful migrations`);
      score -= 1;
    }
  }
  
  // Check if dev is selling while promoting
  if (devWallet?.sellingWhilePromoting) {
    redFlags.push("Dev wallet selling");
    score += 2.5;
  }
  
  // Determine status
  if (score >= 8) {
    status = "CRITICAL";
  } else if (score >= 6) {
    status = "RISKY";
  } else if (score >= 4) {
    status = "MODERATE";
  } else {
    status = "SAFE";
  }
  
  return {
    contract_renounced: security?.contractRenounced || false,
    dev_wallet_history: devWallet 
      ? `${devWallet.previousCoins || 0} previous coins, ${devWallet.migratedCoins || 0} migrated`
      : "Unknown",
    dev_selling_while_promoting: devWallet?.sellingWhilePromoting || false,
    status,
    details: redFlags.length > 0
      ? `${status} - ${redFlags[0]}`
      : greenFlags.length > 0
      ? "Security checks passed"
      : "Insufficient data to evaluate security",
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Analyze social momentum
 */
export function analyzeSocial(tokenData) {
  const { social } = tokenData;
  
  const redFlags = [];
  const greenFlags = [];
  let status = "UNKNOWN";
  
  if (!social) {
    return {
      x_followers: 0,
      posts_per_hour: 0,
      kol_involvement: "None detected",
      status: "UNKNOWN",
      details: "No social data available",
      red_flags: ["No social data"],
      green_flags: []
    };
  }
  
  const followers = social.xFollowers || 0;
  const postsPerHour = social.postsPerHour || 0;
  const kolInvolvement = social.kolInvolvement || "None detected";
  
  if (followers < 100) {
    redFlags.push("Low follower count");
  } else if (followers > 1000) {
    greenFlags.push(`Strong follower base: ${followers}`);
  }
  
  if (postsPerHour < 0.5) {
    redFlags.push("Low post frequency");
    status = "DEAD";
  } else if (postsPerHour > 2) {
    greenFlags.push("Active posting");
    status = "ACTIVE";
  } else {
    status = "MODERATE";
  }
  
  if (kolInvolvement === "None detected") {
    redFlags.push("No KOL engagement");
  } else {
    greenFlags.push(`KOL involvement: ${kolInvolvement}`);
  }
  
  return {
    x_followers: followers,
    posts_per_hour: postsPerHour,
    kol_involvement: kolInvolvement,
    status: status === "UNKNOWN" ? (followers > 0 ? "MODERATE" : "DEAD") : status,
    details: redFlags.length > 0
      ? `Very low engagement - ${redFlags[0]}`
      : greenFlags.length > 0
      ? "Active social momentum"
      : "Moderate social activity",
    red_flags: redFlags,
    green_flags: greenFlags
  };
}

/**
 * Generate actionable guidance based on analysis
 */
export function generateGuidance(analysis) {
  const { overall_risk_score, recommendation } = analysis;
  
  if (recommendation === "BUY" || recommendation === "CAUTION") {
    return {
      if_buying: {
        position_size: overall_risk_score >= 7 
          ? "0.05 SOL max (high risk)"
          : overall_risk_score >= 5
          ? "0.075 SOL max (10-12 SOL range for low cap)"
          : "0.1-0.15 SOL (moderate risk)",
        entry_strategy: "Wait for red candles, avoid FOMO on green spikes",
        profit_targets: "Take 60% at 2-4x to secure initials, leave moon bag",
        stop_loss: "Do NOT use stop losses on memecoins - they'll fake you out"
      },
      if_avoiding: null
    };
  } else {
    return {
      if_buying: null,
      if_avoiding: {
        reason: analysis.all_red_flags.slice(0, 3).join(", "),
        alternative: "Look for coins with renounced contracts, organic volume, and real social momentum"
      }
    };
  }
}

/**
 * Main analysis function - generates complete evaluation
 */
export function analyzeToken(tokenData) {
  const volumeAnalysis = analyzeVolume(tokenData);
  const narrativeAnalysis = analyzeNarrative(tokenData);
  const distributionAnalysis = analyzeDistribution(tokenData);
  const liquidityAnalysis = analyzeLiquidity(tokenData);
  const securityAnalysis = analyzeSecurity(tokenData);
  const socialAnalysis = analyzeSocial(tokenData);
  
  // Calculate overall risk score (weighted by priority)
  // Priority: Distribution (40%), Liquidity (25%), Volume (15%), Security (10%), Narrative (5%), Social (5%)
  const distributionWeight = 0.4;
  const liquidityWeight = 0.25;
  const volumeWeight = 0.15;
  const securityWeight = 0.10;
  const narrativeWeight = 0.05;
  const socialWeight = 0.05;
  
  // Convert liquidity status to score
  const liquidityScore = liquidityAnalysis.status === "DANGEROUS" ? 9 :
                        liquidityAnalysis.status === "RISKY" ? 7 :
                        liquidityAnalysis.status === "MODERATE" ? 5 :
                        liquidityAnalysis.status === "SAFE" ? 2 : 5;
  
  const overallRiskScore = Math.round(
    distributionAnalysis.score * distributionWeight +
    liquidityScore * liquidityWeight +
    volumeAnalysis.score * volumeWeight +
    securityAnalysis.score * securityWeight +
    narrativeAnalysis.score * narrativeWeight +
    socialAnalysis.score * socialWeight
  );
  
  // Determine recommendation
  let recommendation = "CAUTION";
  if (overallRiskScore >= 8) {
    recommendation = "AVOID";
  } else if (overallRiskScore <= 3) {
    recommendation = "BUY";
  }
  
  // Collect all flags
  const allRedFlags = [
    ...distributionAnalysis.red_flags,
    ...liquidityAnalysis.red_flags,
    ...volumeAnalysis.red_flags,
    ...securityAnalysis.red_flags,
    ...narrativeAnalysis.red_flags,
    ...socialAnalysis.red_flags
  ];
  
  const allGreenFlags = [
    ...distributionAnalysis.green_flags,
    ...liquidityAnalysis.green_flags,
    ...volumeAnalysis.green_flags,
    ...securityAnalysis.green_flags,
    ...narrativeAnalysis.green_flags,
    ...socialAnalysis.green_flags
  ];
  
  // Generate summary
  const summary = `${recommendation === "AVOID" ? "High risk token" : recommendation === "BUY" ? "Promising token" : "Moderate risk token"} with ${overallRiskScore}/10 risk score. ` +
    `${distributionAnalysis.status === "CRITICAL" ? "Critical distribution issues. " : ""}` +
    `${liquidityAnalysis.status === "DANGEROUS" ? "Dangerous liquidity levels. " : ""}` +
    `${allRedFlags.length > 0 ? `${allRedFlags.length} red flags detected.` : "No major red flags."}`;
  
  const actionableGuidance = generateGuidance({
    overall_risk_score: overallRiskScore,
    recommendation,
    all_red_flags: allRedFlags
  });
  
  return {
    token_symbol: tokenData.symbol || "UNKNOWN",
    token_address: tokenData.address || "N/A",
    overall_risk_score: overallRiskScore,
    recommendation,
    summary,
    three_pillars: {
      volume: volumeAnalysis,
      narrative: narrativeAnalysis,
      distribution: distributionAnalysis
    },
    liquidity_analysis: liquidityAnalysis,
    security_checks: securityAnalysis,
    social_momentum: socialAnalysis,
    actionable_guidance: actionableGuidance,
    all_red_flags: allRedFlags,
    all_green_flags: allGreenFlags
  };
}
