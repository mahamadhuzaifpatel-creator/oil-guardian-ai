import { useEffect, useRef, useState } from "react";
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
  const [reportType, setReportType] = useState("");
  const [categorySource, setCategorySource] = useState("");
  const [aiTypeSuggestion, setAiTypeSuggestion] = useState(null);
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
  const [ocrProgress, setOcrProgress] = useState(0);
  const [inputNotice, setInputNotice] = useState("");
  const recognitionRef = useRef(null);

  const API_URL =
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000";


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

    if (!reportType) {
      setAnalysisError(
        "Please choose what you are reporting (or pick \"Not sure\" and the AI will suggest a type)."
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
      } else if (sifPercentage >= 50) {
        // 50% = the validated SIF decision threshold, so every
        // SIF-flagged report is at least Moderate and every non-SIF is Low
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

      // Report type: the employee's answer wins; "Not sure" uses the AI suggestion.
      // The AI suggestion is only a hint (about 50% accurate on independent reports).
      const aiType = data.report_type || null;
      setAiTypeSuggestion(aiType);

      if (reportType === "auto") {
        setCategory(aiType?.type || "Unclassified");
        setCategorySource(aiType ? "ai" : "none");
      } else {
        setCategory(reportType);
        setCategorySource("employee");
      }

      setIogpRule(
        ensemble.iogp_rule ||
          strongestModel?.data?.iogp_rule ||
          "Not determined"
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
              category_source: categorySource || null,
              report_type_ai: aiResult?.report_type ?? null,
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

  // Browser speech recognition (Chrome / Edge). Click once to start,
  // click again to stop. Spoken text is added to the report box.
  const VOICE_ERRORS = {
    "not-allowed": "Microphone permission was blocked. Allow the microphone in the browser address bar and try again.",
    "service-not-allowed": "Microphone permission was blocked. Allow the microphone in the browser address bar and try again.",
    "no-speech": "No speech was detected. Click Voice and speak clearly.",
    "audio-capture": "No microphone was found on this device.",
    "network": "The browser's speech service could not be reached. Use Google Chrome with an internet connection (Brave and Firefox are not supported).",
    "aborted": ""
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAnalysisError(
        "Voice input is not supported by this browser. Please use Google Chrome or Microsoft Edge."
      );
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsListening(true);
      setAnalysisError("");
      setInputNotice("Listening... click Voice again to stop.");
    };

    recognition.onresult = (event) => {
      let spoken = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          spoken += event.results[i][0].transcript;
        }
      }
      spoken = spoken.trim();
      if (spoken) {
        setHasAnalyzed(false);
        setReport((previous) => (previous ? `${previous} ${spoken}` : spoken));
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      const message = VOICE_ERRORS[event.error] ?? `Voice input failed (${event.error}). Please type the report instead.`;
      if (message) setAnalysisError(message);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInputNotice("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Could not start speech recognition:", error);
      setAnalysisError("Voice input could not start. Please try again.");
    }
  };

  // Clean up a phone photo before OCR: scale to a good size, convert to
  // grayscale, stretch contrast and remove uneven lighting (shadows, paper tint).
  const preprocessForOcr = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const targetWidth = Math.min(2400, Math.max(1600, img.width));
        const scale = targetWidth / img.width;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        const image = ctx.getImageData(0, 0, width, height);
        const px = image.data;
        const gray = new Float32Array(width * height);
        for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
          gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        }

        // Estimate the paper brightness with a coarse block grid,
        // then divide it out so shadows and gradients disappear.
        const block = 48;
        const bw = Math.ceil(width / block);
        const bh = Math.ceil(height / block);
        const background = new Float32Array(bw * bh);
        for (let by = 0; by < bh; by += 1) {
          for (let bx = 0; bx < bw; bx += 1) {
            let max = 0;
            for (let y = by * block; y < Math.min(height, (by + 1) * block); y += 4) {
              for (let x = bx * block; x < Math.min(width, (bx + 1) * block); x += 4) {
                const v = gray[y * width + x];
                if (v > max) max = v;
              }
            }
            background[by * bw + bx] = Math.max(max, 1);
          }
        }

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const j = y * width + x;
            const bg = background[Math.floor(y / block) * bw + Math.floor(x / block)];
            const normalised = Math.min(255, (gray[j] / bg) * 255);
            // Pen strokes become solid black, paper becomes white
            const value = normalised < 185 ? 0 : 255;
            const i = j * 4;
            px[i] = px[i + 1] = px[i + 2] = value;
            px[i + 3] = 255;
          }
        }

        ctx.putImageData(image, 0, 0);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This image could not be opened. Please try another photo."));
      };

      img.src = url;
    });

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

    setOcrProgress(0);
    setInputNotice("");

    let worker = null;

    try {
      // OCR runs entirely in the browser (Tesseract.js), so no OCR server is needed.
      // The library is only downloaded when someone actually uses OCR.
      const { createWorker } = await import("tesseract.js");

      worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setOcrProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });

      const cleanedImage = await preprocessForOcr(file);
      const { data } = await worker.recognize(cleanedImage);

      const extractedText = (data?.text || "")
        .split("\n")
        .map((line) => line.trim())
        // Drop stray marks: keep lines that contain a real word (3+ letters)
        .filter((line) => /[A-Za-z]{3,}/.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!extractedText) {
        throw new Error(
          "No readable text was found in this image. Try a clearer, well-lit photo of printed or typed text."
        );
      }

      setReport(extractedText);
      setMode("ocr");

      const confidence = Number(data?.confidence);

      setInputNotice(
        Number.isFinite(confidence) && confidence < 60
          ? `Text extracted, but recognition confidence is low (${confidence.toFixed(0)}%). Please correct the text before analyzing.`
          : "Text extracted from the image. Please check it before analyzing."
      );
    } catch (error) {
      console.error("OCR failed:", error);
      setAnalysisError(
        error.message ||
          "OCR failed. Please try a clearer image or type the report."
      );
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
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
    setInputNotice("");
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
                  Moran Oilfield
                </option>

                <option>
                  Rajasthan Fields (Jodhpur)
                </option>

                <option>
                  OIL Pipeline Station (Guwahati)
                </option>

                <option>
                  Numaligarh Refinery (NRL)
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

          <div className="employee-context-card">

            <div className="employee-context-icon">
              <FileText size={18} />
            </div>

            <div className="employee-context-content">

              <label>
                WHAT ARE YOU REPORTING?
              </label>

              <select
                value={reportType}
                onChange={(event) => {
                  setReportType(
                    event.target.value
                  );
                  setHasAnalyzed(false);
                }}
              >

                <option value="" disabled>
                  Choose one
                </option>

                <option value="Unsafe Act">
                  Someone was doing something unsafe
                </option>

                <option value="Unsafe Condition">
                  Something in the workplace is unsafe (equipment, area, material)
                </option>

                <option value="Near Miss">
                  Something almost happened, but nobody was hurt
                </option>

                <option value="Incident">
                  Someone got hurt, or damage happened
                </option>

                <option value="auto">
                  Not sure – let the AI suggest
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
              {isListening ? "Stop" : "Voice"}
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

                Reading text from image... {ocrProgress}%

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
                  Upload a clear photo of a printed or
                  typed safety form. Handwriting may not
                  be read accurately.
                </span>

              </div>
            )}


          {inputNotice && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#6ee7b7",
                fontSize: "13px"
              }}
            >
              {inputNotice}
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
                      SIF POTENTIAL SCORE
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

                    {categorySource === "ai" && (
                      <small style={{ display: "block", marginTop: "4px", color: "#94a3b8", fontSize: "11px" }}>
                        AI-suggested ({aiTypeSuggestion?.confidence}%) · officer will confirm
                      </small>
                    )}

                    {categorySource === "employee" &&
                      aiTypeSuggestion &&
                      aiTypeSuggestion.type !== category && (
                        <small style={{ display: "block", marginTop: "4px", color: "#94a3b8", fontSize: "11px" }}>
                          AI thinks it may be: {aiTypeSuggestion.type}
                        </small>
                      )}

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