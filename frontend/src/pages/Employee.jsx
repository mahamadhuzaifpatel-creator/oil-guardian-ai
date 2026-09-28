import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  MapPin,
  Mic,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import AccountControls from "../components/AccountControls";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

import "./Employee.css";

export default function Employee() {
  const { user } = useAuth();

  const [location, setLocation] = useState(
    "Duliajan Oilfield (Drilling)"
  );

  const [department, setDepartment] = useState(
    "Drilling Operations"
  );

  const [mode, setMode] = useState("text");
  const [report, setReport] = useState("");

  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [risk, setRisk] = useState("");
  const [category, setCategory] = useState("");
  const [sifRisk, setSifRisk] = useState("");
  const [iogpRule, setIogpRule] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [transmissions, setTransmissions] = useState([]);
  const [loadingTransmissions, setLoadingTransmissions] =
    useState(true);

  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const API_URL =
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000";
  
  const OCR_API_URL =
    import.meta.env.VITE_OCR_API_URL ||
    "http://127.0.0.1:8001";  

  useEffect(() => {
    const loadTransmissions = async () => {
      if (!user?.id) {
        setTransmissions([]);
        setLoadingTransmissions(false);
        return;
      }

      setLoadingTransmissions(true);
      setSubmitError("");

      const { data, error } = await supabase
        .from("reports")
        .select(`
          id,
          report_text,
          facility_location,
          operational_department,
          risk_tier,
          status,
          category,
          sif_percentage,
          iogp_rule,
          created_at
        `)
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false
        });

      if (error) {
        console.error(
          "Failed to load reports:",
          error
        );

        setSubmitError(
          `Could not load your reports: ${error.message}`
        );

        setTransmissions([]);
        setLoadingTransmissions(false);
        return;
      }

      const formattedReports = (data || []).map(
        (item) => ({
          id: item.id,
          risk:
            item.risk_tier ||
            "Unknown Risk",
          status:
            ({
              submitted: "Submitted",
              under_review: "Under Investigation",
              action_required: "Action Required",
              closed: "Closed"
            })[item.status] ||
            item.status ||
            "Submitted",
          text: item.report_text || "",
          location:
            item.facility_location || "",
          department:
            item.operational_department || "",
          category:
            item.category || "",
          sifPercentage:
            item.sif_percentage !== null &&
            item.sif_percentage !== undefined
              ? `${Number(
                  item.sif_percentage
                ).toFixed(1)}%`
              : "",
          iogpRule:
            item.iogp_rule || "",
          createdAt: item.created_at
        })
      );

      setTransmissions(formattedReports);
      setLoadingTransmissions(false);
    };

    loadTransmissions();
  }, [user?.id]);

  const loadSample = () => {
    setMode("text");

    setReport(
      "Worker entered a confined space without performing the required gas test."
    );

    setHasAnalyzed(false);
    setRisk("");
    setCategory("");
    setSifRisk("");
    setIogpRule("");
    setAnalysisError("");
    setSubmitError("");
  };

  const analyzeReport = async () => {
    if (!report.trim()) {
      setAnalysisError(
        "Please enter a safety observation first."
      );
      return;
    }

    setAnalyzing(true);
    setAnalysisError("");
    setSubmitError("");

    try {
      const response = await fetch(
        `${API_URL}/api/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: report.trim()
          })
        }
      );

      if (!response.ok) {
        throw new Error(
          `AI server returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const ensemble = data.ensemble;
      const models = data.models;

      if (!ensemble || !models) {
        throw new Error(
          "AI server returned an incomplete analysis."
        );
      }

      const sifPercentage = Number(
        ensemble.sif_percentage
      );

      if (!Number.isFinite(sifPercentage)) {
        throw new Error(
          "AI server did not return a valid SIF percentage."
        );
      }

      let displayedRisk =
        ensemble.risk_tier ||
        "Unknown Risk";

      if (sifPercentage >= 70) {
        displayedRisk = "High Risk";
      } else if (sifPercentage >= 40) {
        displayedRisk = "Moderate Risk";
      } else {
        displayedRisk = "Low Risk";
      }

      const modelEntries = [
        {
          key: "near_miss",
          data: models.near_miss
        },
        {
          key: "unsafe_act",
          data: models.unsafe_act
        },
        {
          key: "unsafe_condition",
          data: models.unsafe_condition
        }
      ].filter(
        (item) => item.data
      );

      let strongestModel = null;

      if (modelEntries.length > 0) {
        strongestModel =
          modelEntries.reduce(
            (highest, current) => {
              const currentConfidence =
                Number(
                  current.data.confidence
                ) || 0;

              const highestConfidence =
                Number(
                  highest.data.confidence
                ) || 0;

              return currentConfidence >
                highestConfidence
                ? current
                : highest;
            }
          );
      }

      setRisk(displayedRisk);

      setSifRisk(
        `${sifPercentage.toFixed(1)}%`
      );

      setCategory(
        strongestModel?.data?.category ||
          strongestModel?.key ||
          ensemble.category ||
          "Safety Observation"
      );

      setIogpRule(
        strongestModel?.data?.iogp_rule ||
          ensemble.iogp_rule ||
          "Operational Safety"
      );

      setAiResult(data);
      setHasAnalyzed(true);
    } catch (error) {
      console.error(
        "AI analysis failed:",
        error
      );

      setHasAnalyzed(false);
      setRisk("");
      setCategory("");
      setSifRisk("");
      setIogpRule("");

      setAnalysisError(
        error.message ||
          "Unable to analyze the report. Make sure the FastAPI server is running."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const transmitReport = async () => {
    if (!report.trim()) {
      setSubmitError(
        "Please enter a safety observation."
      );
      return;
    }

    if (!user?.id) {
      setSubmitError(
        "You are not logged in. Please log in again."
      );
      return;
    }

    if (!hasAnalyzed) {
      setSubmitError(
        "Please analyze the report before transmitting it."
      );
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const sifPercentage = Number(
        sifRisk.replace("%", "")
      );

      const sifProbability =
        Number.isFinite(sifPercentage)
          ? sifPercentage / 100
          : null;

      const { data, error } =
        await supabase
          .from("reports")
          .insert({
            user_id: user.id,
            report_text: report.trim(),
            facility_location: location,
            operational_department:
              department,
            input_mode: mode,
            near_miss_confidence:
              aiResult?.models?.near_miss?.confidence ?? null,
            unsafe_act_confidence:
              aiResult?.models?.unsafe_act?.confidence ?? null,
            unsafe_condition_confidence:
              aiResult?.models?.unsafe_condition?.confidence ?? null,
            category:
              category || null,
            sif_probability:
              sifProbability,
            sif_percentage:
              Number.isFinite(
                sifPercentage
              )
                ? sifPercentage
                : null,
            risk_tier:
              risk || null,
            iogp_rule:
              iogpRule || null,
            status: "submitted",
            ai_result: {
              category,
              risk_tier: risk,
              sif_probability:
                sifProbability,
              sif_percentage:
                Number.isFinite(
                  sifPercentage
                )
                  ? sifPercentage
                  : null,
              iogp_rule: iogpRule,
              models: aiResult?.models ?? null,
              ensemble: aiResult?.ensemble ?? null
            }
          })
          .select()
          .single();

      if (error) {
        console.error(
          "Supabase report insert failed:",
          error
        );

        throw new Error(
          `Report could not be submitted: ${error.message}`
        );
      }

      const newTransmission = {
        id: data.id,
        risk:
          data.risk_tier ||
          risk ||
          "Unknown Risk",
        status: "Submitted",
        text: data.report_text,
        location:
          data.facility_location ||
          location,
        department:
          data.operational_department ||
          department,
        category:
          data.category ||
          category,
        sifPercentage:
          data.sif_percentage !== null &&
          data.sif_percentage !== undefined
            ? `${Number(
                data.sif_percentage
              ).toFixed(1)}%`
            : sifRisk,
        iogpRule:
          data.iogp_rule ||
          iogpRule,
        createdAt:
          data.created_at
      };

      setTransmissions(
        (previous) => [
          newTransmission,
          ...previous
        ]
      );

      setReport("");
      setHasAnalyzed(false);
      setRisk("");
      setCategory("");
      setSifRisk("");
      setIogpRule("");
      setAnalysisError("");
      setSubmitError("");
    } catch (error) {
      console.error(
        "Report submission error:",
        error
      );

      setSubmitError(
        error.message ||
          "Report submission failed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAnalysisError(
        "Voice recognition is not supported by this browser."
      );
      return;
    }

    if (isListening) {
      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setAnalysisError("");
    };

    recognition.onresult = (event) => {
      const transcript =
        event.results?.[0]?.[0]
          ?.transcript || "";

      if (transcript) {
        setReport(
          (previous) =>
            previous
              ? `${previous} ${transcript}`
              : transcript
        );
      }
    };

    recognition.onerror = (event) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      setAnalysisError(
        `Voice input failed: ${event.error}`
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleOCRUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/bmp"
    ];

    if (!allowedTypes.includes(file.type)) {
      setAnalysisError(
        "Please upload a JPG, PNG, WEBP, or BMP image."
      );

      event.target.value = "";
      return;
    }

    setOcrLoading(true);
    setAnalysisError("");
    setSubmitError("");

    // Clear any previous AI assessment because
    // the report content is about to change.
    setHasAnalyzed(false);
    setRisk("");
    setCategory("");
    setSifRisk("");
    setIogpRule("");

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(
        `${OCR_API_URL}/api/ocr`,
        {
          method: "POST",
          body: formData
        }
      );

      if (!response.ok) {
        let errorMessage =
          `OCR server returned HTTP ${response.status}`;

        try {
          const errorData =
            await response.json();

          if (errorData?.detail) {
            errorMessage = errorData.detail;
          }
        } catch {
          // Keep the HTTP error message.
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.detail ||
            "OCR processing was unsuccessful."
        );
      }

      const extractedText =
        data.text?.trim();

      if (!extractedText) {
        throw new Error(
          "OCR could not detect readable text in this image."
        );
      }

      setReport(extractedText);
      setMode("ocr");

      const confidence =
        Number(data.confidence);

      if (
        Number.isFinite(confidence)
      ) {
        setAnalysisError(
          `OCR completed successfully — ${confidence.toFixed(
            1
          )}% text recognition confidence. Please review the extracted text before analyzing.`
        );
      }

    } catch (error) {
      console.error(
        "OCR failed:",
        error
      );

      setAnalysisError(
        error.message ||
          "OCR failed. Make sure the PaddleOCR server is running on port 8001."
      );
    } finally {
      setOcrLoading(false);

      // Allow the same image to be selected again.
      event.target.value = "";
    }
  };

  const clearReport = () => {
    setReport("");
    setHasAnalyzed(false);
    setRisk("");
    setCategory("");
    setSifRisk("");
    setIogpRule("");
    setAnalysisError("");
    setSubmitError("");
  };

  return (
    <div className="employee-page">

      <header className="employee-header">

        <div className="employee-brand">

          <div className="employee-brand-icon">
            <ShieldCheck size={22} />
          </div>

          <div>
            <h1>
              OIL GUARDIAN AI
            </h1>

            <span>
              Employee Safety Intelligence
            </span>
          </div>

        </div>

        <div className="employee-header-right">

          <div className="employee-system-status">

            <span />

            AI SYSTEM ONLINE

          </div>

          <AccountControls />

        </div>

      </header>


      <main className="employee-main">

        <motion.div
          className="employee-page-title"
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5
          }}
        >

          <div>

            <div className="employee-eyebrow">
              <Radio size={14} />
              FIELD SAFETY TRANSMISSION
            </div>

            <h2>
              Report a Safety Observation
            </h2>

            <p>
              Submit hazards, unsafe acts,
              unsafe conditions and near-miss
              observations for AI-powered
              safety analysis.
            </p>

          </div>

        </motion.div>


        <motion.section
          className="employee-context-grid"
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5,
            delay: 0.1
          }}
        >

          <div className="employee-context-card">

            <div className="employee-context-icon">
              <MapPin size={18} />
            </div>

            <div className="employee-context-content">

              <label>
                FACILITY / LOCATION
              </label>

              <select
                value={location}
                onChange={(event) =>
                  setLocation(
                    event.target.value
                  )
                }
              >

                <option>
                  Duliajan Oilfield (Drilling)
                </option>

                <option>
                  Duliajan Oilfield (Production)
                </option>

                <option>
                  Digboi Refinery
                </option>

                <option>
                  Numaligarh Refinery
                </option>

                <option>
                  Guwahati Refinery
                </option>

              </select>

            </div>

          </div>


          <div className="employee-context-card">

            <div className="employee-context-icon">
              <FileText size={18} />
            </div>

            <div className="employee-context-content">

              <label>
                OPERATIONAL DEPARTMENT
              </label>

              <select
                value={department}
                onChange={(event) =>
                  setDepartment(
                    event.target.value
                  )
                }
              >

                <option>
                  Drilling Operations
                </option>

                <option>
                  Production Operations
                </option>

                <option>
                  Maintenance
                </option>

                <option>
                  Electrical
                </option>

                <option>
                  Mechanical
                </option>

                <option>
                  Process Safety
                </option>

                <option>
                  HSE
                </option>

              </select>

            </div>

          </div>

        </motion.section>


        <motion.section
          className="employee-report-panel"
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5,
            delay: 0.2
          }}
        >

          <div className="employee-panel-header">

            <div>

              <div className="employee-panel-title">

                <Sparkles size={16} />

                SAFETY OBSERVATION

              </div>

              <p>
                Describe what happened, where
                it happened and any immediate
                hazard.
              </p>

            </div>

            <button
              type="button"
              className="employee-sample-button cursor-target"
              onClick={loadSample}
            >
              Load Sample
            </button>

          </div>


          <div className="employee-input-tabs">

            <button
              type="button"
              className={
                mode === "text"
                  ? "employee-input-tab active cursor-target"
                  : "employee-input-tab cursor-target"
              }
              onClick={() =>
                setMode("text")
              }
            >
              <FileText size={16} />
              Text
            </button>


            <button
              type="button"
              className={
                mode === "voice"
                  ? "employee-input-tab active cursor-target"
                  : "employee-input-tab cursor-target"
              }
              onClick={() => {
                setMode("voice");
                startVoiceInput();
              }}
            >
              <Mic size={16} />
              Voice
            </button>


            <label
              className={
                mode === "ocr"
                  ? "employee-input-tab active cursor-target"
                  : "employee-input-tab cursor-target"
              }
            >

              <ImageIcon size={16} />

              OCR

              <input
                type="file"
                accept="image/*"
                onChange={
                  handleOCRUpload
                }
                hidden
              />

            </label>

          </div>


          <div className="employee-textarea-wrapper">

            <textarea
              value={report}
              onChange={(event) => {
                setReport(
                  event.target.value
                );

                setHasAnalyzed(false);
                setRisk("");
                setCategory("");
                setSifRisk("");
                setIogpRule("");
                setAnalysisError("");
                setSubmitError("");
              }}
              placeholder="Describe the safety observation..."
              rows={8}
            />

            <div className="employee-textarea-footer">

              <span>
                {report.length} characters
              </span>

              {report && (
                <button
                  type="button"
                  className="cursor-target"
                  onClick={
                    clearReport
                  }
                >
                  <X size={14} />
                  Clear
                </button>
              )}

            </div>

          </div>


          <AnimatePresence>

            {isListening && (
              <motion.div
                className="employee-info-message"
                initial={{
                  opacity: 0,
                  height: 0
                }}
                animate={{
                  opacity: 1,
                  height: "auto"
                }}
                exit={{
                  opacity: 0,
                  height: 0
                }}
              >
                <Volume2 size={16} />

                Listening... speak your
                safety observation.

              </motion.div>
            )}

          </AnimatePresence>


          <AnimatePresence>

            {ocrLoading && (
              <motion.div
                className="employee-info-message"
                initial={{
                  opacity: 0,
                  height: 0
                }}
                animate={{
                  opacity: 1,
                  height: "auto"
                }}
                exit={{
                  opacity: 0,
                  height: 0
                }}
              >

                <Upload size={16} />

                Extracting text from image...

              </motion.div>
            )}

          </AnimatePresence>


          {mode === "ocr" &&
            !ocrLoading && (
              <div className="employee-ocr-panel">

                <label className="employee-ocr-button cursor-target">

                  <Camera size={17} />

                  Upload Safety Image

                  <input
                    type="file"
                    accept="image/*"
                    onChange={
                      handleOCRUpload
                    }
                    hidden
                  />

                </label>

                <span>
                  Upload a handwritten or
                  printed safety observation.
                </span>

              </div>
            )}


          <AnimatePresence>

            {analysisError && (
              <motion.div
                className="analysis-error"
                initial={{
                  opacity: 0,
                  height: 0,
                  y: -8
                }}
                animate={{
                  opacity: 1,
                  height: "auto",
                  y: 0
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  y: -8
                }}
              >

                <AlertTriangle size={16} />

                <span>
                  {analysisError}
                </span>

              </motion.div>
            )}

          </AnimatePresence>


          <AnimatePresence>

            {submitError && (
              <motion.div
                className="analysis-error"
                initial={{
                  opacity: 0,
                  height: 0,
                  y: -8
                }}
                animate={{
                  opacity: 1,
                  height: "auto",
                  y: 0
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                  y: -8
                }}
              >

                <AlertTriangle size={16} />

                <span>
                  {submitError}
                </span>

              </motion.div>
            )}

          </AnimatePresence>


          <button
            type="button"
            className="employee-analyze-button cursor-target"
            onClick={analyzeReport}
            disabled={
              analyzing ||
              !report.trim()
            }
          >

            <Sparkles size={18} />

            {analyzing
              ? "Analyzing Safety Risk..."
              : "Analyze Safety Risk"}

          </button>


          <AnimatePresence>

            {hasAnalyzed && (
              <motion.div
                className="employee-ai-result"
                initial={{
                  opacity: 0,
                  y: 15
                }}
                animate={{
                  opacity: 1,
                  y: 0
                }}
                exit={{
                  opacity: 0,
                  y: -10
                }}
              >

                <div className="employee-ai-result-header">

                  <div>

                    <div className="employee-ai-label">

                      <Sparkles size={14} />

                      AI SAFETY ASSESSMENT

                    </div>

                    <h3>
                      Analysis Complete
                    </h3>

                  </div>

                  <div className="employee-complete">

                    <CheckCircle2 size={17} />

                    Complete

                  </div>

                </div>


                <div className="employee-result-grid">

                  <div className="employee-result-card">

                    <span>
                      RISK LEVEL
                    </span>

                    <strong
                      className={
                        risk === "High Risk"
                          ? "risk-high-text"
                          : risk === "Moderate Risk"
                          ? "risk-medium-text"
                          : "risk-low-text"
                      }
                    >
                      {risk || "Unknown"}
                    </strong>

                  </div>


                  <div className="employee-result-card">

                    <span>
                      SIF PROBABILITY
                    </span>

                    <strong>
                      {sifRisk || "0.0%"}
                    </strong>

                  </div>


                  <div className="employee-result-card">

                    <span>
                      CATEGORY
                    </span>

                    <strong>
                      {category ||
                        "Safety Observation"}
                    </strong>

                  </div>


                  <div className="employee-result-card">

                    <span>
                      IOGP / SAFETY RULE
                    </span>

                    <strong>
                      {iogpRule ||
                        "Operational Safety"}
                    </strong>

                  </div>

                </div>


                <button
                  type="button"
                  className="employee-transmit-button cursor-target"
                  onClick={
                    transmitReport
                  }
                  disabled={
                    submitting
                  }
                >

                  <Send size={18} />

                  {submitting
                    ? "Submitting to Safety Database..."
                    : `Transmit Report (${category || "Safety Observation"} · ${risk || "Unknown Risk"})`}

                </button>

              </motion.div>
            )}

          </AnimatePresence>

        </motion.section>


        <motion.section
          className="employee-transmissions"
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5,
            delay: 0.3
          }}
        >

          <div className="employee-transmissions-header">

            <div>

              <div className="employee-eyebrow">

                <Radio size={14} />

                MY TRANSMISSIONS

              </div>

              <h2>
                Submitted Safety Reports
              </h2>

            </div>

            <div className="employee-report-count">

              {loadingTransmissions
                ? "Loading..."
                : `${transmissions.length} Reports`}

            </div>

          </div>


          <div className="transmission-list">

            {loadingTransmissions ? (
              <div className="employee-transmission-card">

                <div className="employee-loading">

                  <div className="loading-spinner" />

                  Loading your reports...

                </div>

              </div>
            ) : transmissions.length === 0 ? (
              <div className="employee-empty-card">

                <FileText size={25} />

                <div>

                  <strong>
                    No reports submitted yet
                  </strong>

                  <p>
                    Your submitted safety
                    observations will appear
                    here.
                  </p>

                </div>

              </div>
            ) : (
              <AnimatePresence>

                {transmissions.map(
                  (transmission) => (
                    <motion.div
                      key={
                        transmission.id
                      }
                      className="employee-transmission-card"
                      initial={{
                        opacity: 0,
                        y: 15
                      }}
                      animate={{
                        opacity: 1,
                        y: 0
                      }}
                      exit={{
                        opacity: 0,
                        y: -10
                      }}
                      layout
                    >

                      <div className="employee-transmission-top">

                        <div>

                          <span className="employee-report-id">

                            REPORT #

                            {transmission.id}

                          </span>

                          <span className="employee-report-date">

                            {transmission.createdAt
                              ? new Date(
                                  transmission.createdAt
                                ).toLocaleString(
                                  "en-IN"
                                )
                              : ""}

                          </span>

                        </div>


                        <div className="employee-submitted-status">

                          <span />

                          {transmission.status}

                        </div>

                      </div>


                      <p className="employee-transmission-text">

                        {
                          transmission.text
                        }

                      </p>


                      <div className="employee-transmission-meta">

                        <span>
                          <MapPin size={13} />
                          {
                            transmission.location
                          }
                        </span>

                        <span>
                          <FileText size={13} />
                          {
                            transmission.department
                          }
                        </span>

                        {transmission.category && (
                          <span>
                            {
                              transmission.category
                            }
                          </span>
                        )}

                        {transmission.sifPercentage && (
                          <span>
                            SIF{" "}
                            {
                              transmission.sifPercentage
                            }
                          </span>
                        )}

                        {transmission.risk && (
                          <span
                            className={
                              transmission.risk ===
                              "High Risk"
                                ? "meta-high"
                                : transmission.risk ===
                                  "Moderate Risk"
                                ? "meta-medium"
                                : "meta-low"
                            }
                          >
                            {
                              transmission.risk
                            }
                          </span>
                        )}

                      </div>

                    </motion.div>
                  )
                )}

              </AnimatePresence>
            )}

          </div>

        </motion.section>

      </main>

    </div>
  );
}