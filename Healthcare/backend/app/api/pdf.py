import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from app.database.database import get_db
from app.models.models import Patient, User, MedicalHistory, Prediction, Appointment, HeartPrediction
from app.services.recommendation import get_doctor_recommendations
from app.auth.dependencies import get_current_user, require_pdf_download_access

router = APIRouter(tags=["pdf"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMP_DIR = os.path.join(BASE_DIR, "uploads", "reports")

# Helper function to check if a doctor is assigned to a patient
def is_doctor_assigned(db: Session, doctor_id: int, patient_id: int) -> bool:
    appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient_id,
        Appointment.doctor_id == doctor_id
    ).first()
    return appointment is not None


def draw_header_footer(canvas, doc):
    canvas.saveState()
    
    # Draw subtle background diagonal watermark
    canvas.setFont('Helvetica-Bold', 36)
    canvas.setFillColor(colors.HexColor('#f1f5f9')) # Very light slate gray
    canvas.saveState()
    canvas.translate(306, 396) # Center of the letter page (612x792)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, "CAREPULSE CLINICAL REPORT")
    canvas.restoreState()
    
    # Draw top colored bar
    canvas.setFillColor(colors.HexColor('#0d9488')) # Primary Corporate Teal
    canvas.rect(0, 782, 612, 10, fill=True, stroke=False)
    
    # Draw footer line
    canvas.setStrokeColor(colors.HexColor('#cbd5e1'))
    canvas.setLineWidth(0.5)
    canvas.line(36, 45, 576, 45)
    
    # Footer text
    canvas.setFont('Helvetica-Oblique', 8)
    canvas.setFillColor(colors.HexColor('#64748b'))
    canvas.drawString(36, 32, "CarePulse Healthcare Portal — Patient Clinical Summary")
    canvas.drawRightString(576, 32, f"Page {doc.page}")
    canvas.restoreState()


@router.get("/patients/{patient_id}/pdf-report")
def generate_pdf_report(
    patient_id: int,
    slot_user: User = Depends(require_pdf_download_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure patient exists
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
        
    # Access Control Checks
    if current_user.role == "admin":
        pass
    elif current_user.role == "doctor":
        pass
    elif current_user.role == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only export your own report."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized access"
        )
        
    # Fetch medical history
    history = db.query(MedicalHistory).filter(MedicalHistory.patient_id == patient_id).all()
    
    # Fetch latest prediction
    latest_pred = db.query(Prediction)\
        .filter(Prediction.patient_id == patient_id)\
        .order_by(Prediction.created_at.desc())\
        .first()

    # Fetch latest heart prediction
    latest_heart_pred = db.query(HeartPrediction)\
        .filter(HeartPrediction.patient_id == patient.user_id)\
        .order_by(HeartPrediction.created_at.desc())\
        .first()
        
    # Ensure temp directory exists
    os.makedirs(TEMP_DIR, exist_ok=True)
    pdf_filename = f"report_patient_{patient_id}.pdf"
    pdf_path = os.path.join(TEMP_DIR, pdf_filename)
    
    # 1. Create PDF Document layout
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=48,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0f766e'), # Corporate Dark Teal
        spaceBefore=12,
        spaceAfter=8,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=6
    )
    
    table_cell_style = ParagraphStyle(
        'TableCellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#0f172a')
    )
    
    table_header_style = ParagraphStyle(
        'TableHeaderText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white
    )
    
    disclaimer_style = ParagraphStyle(
        'DisclaimerText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#64748b'),
        spaceBefore=0
    )
    
    story = []
    
    # Document Branded Header Table
    brand_style = ParagraphStyle(
        'BrandText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24
    )
    doc_meta_style = ParagraphStyle(
        'DocMetaText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        alignment=2 # Right aligned
    )
    
    header_data = [
        [
            Paragraph("<b><font color='#0d9488'>✚</font> CarePulse</b><font color='#475569'> Diagnostics</font>", brand_style),
            Paragraph("<b>CLINICAL RISK REPORT</b><br/><font size=8 color='#64748b'>Generated: " + datetime.utcnow().strftime('%Y-%m-%d %H:%M') + " UTC</font>", doc_meta_style)
        ]
    ]
    t_header = Table(header_data, colWidths=[300, 240])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LINEBELOW', (0,0), (-1,-1), 1.5, colors.HexColor('#0d9488')), # Teal divider
    ]))
    story.append(t_header)
    story.append(Spacer(1, 15))
    
    # Section A: Patient Profile
    story.append(Paragraph("1. Patient Profile", section_heading))
    profile_data = [
        ["Name", patient.user.name, "Email", patient.user.email],
        ["Age", str(patient.age or "N/A"), "Gender", str(patient.gender or "N/A")],
        ["Height", f"{patient.height} cm" if patient.height else "N/A", "Weight", f"{patient.weight} kg" if patient.weight else "N/A"],
        ["Blood Group", str(patient.blood_group or "N/A"), "Phone", str(patient.phone or "N/A")],
        ["Address", str(patient.address or "N/A"), "", ""]
    ]
    t1 = Table(profile_data, colWidths=[80, 190, 80, 190])
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#f0fdfa')), # Light teal labels
        ('BACKGROUND', (2,0), (2,-2), colors.HexColor('#f0fdfa')),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#0f172a')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#99f6e4')), # Teal border
        ('SPAN', (1,4), (3,4)),  # Span address across cols
    ]))
    story.append(t1)
    story.append(Spacer(1, 12))
    
    # Section B: Latest Prediction Analysis
    story.append(Paragraph("2. Diabetes Risk Prediction Analysis", section_heading))
    if not latest_pred:
        story.append(Paragraph("No prediction results found for this patient. Please run a risk screening first.", body_style))
        recommendations = []
    else:
        features = latest_pred.input_features
        features_data = [
            [Paragraph("<b>Feature</b>", table_header_style), Paragraph("<b>Value</b>", table_header_style), Paragraph("<b>Clinical Significance</b>", table_header_style)],
            [Paragraph("Pregnancies", table_cell_style), Paragraph(str(features.get("pregnancies", "0")), table_cell_style), Paragraph("Indicates gestational exposure history", table_cell_style)],
            [Paragraph("Glucose Level", table_cell_style), Paragraph(f"{features.get('glucose', '0')} mg/dL", table_cell_style), Paragraph("Elevated values (&gt; 140 mg/dL) suggest insulin resistance", table_cell_style)],
            [Paragraph("Diastolic BP", table_cell_style), Paragraph(f"{features.get('blood_pressure', '0')} mm Hg", table_cell_style), Paragraph("Values &gt; 90 mm Hg indicate cardiovascular hypertension", table_cell_style)],
            [Paragraph("Serum Insulin", table_cell_style), Paragraph(f"{features.get('insulin', '0')} mu U/ml", table_cell_style), Paragraph("Shows pancreas insulin production levels", table_cell_style)],
            [Paragraph("BMI", table_cell_style), Paragraph(str(features.get("bmi", "0")), table_cell_style), Paragraph("Values &gt;= 30 indicate obesity, a major diabetes factor", table_cell_style)],
            [Paragraph("Age", table_cell_style), Paragraph(f"{features.get('age', '0')} years", table_cell_style), Paragraph("Diabetes risk increases with aging", table_cell_style)]
        ]
        
        recommendations = get_doctor_recommendations(
            risk_score=latest_pred.risk_score,
            glucose=features.get("glucose", 0.0),
            blood_pressure=features.get("blood_pressure", 0.0),
            bmi=features.get("bmi", 0.0),
            db=db,
            patient_id=patient_id
        )
        
        t3 = Table(features_data, colWidths=[120, 100, 320])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0d9488')), # Teal header
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,2), (-1,2), colors.white),
            ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,4), (-1,4), colors.white),
            ('BACKGROUND', (0,5), (-1,5), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,6), (-1,6), colors.white),
        ]))
        
        # Build Stamp Badge
        stamp_bg = '#fef2f2' if latest_pred.risk_score >= 50 else '#f0fdf4'
        stamp_border = '#ef4444' if latest_pred.risk_score >= 50 else '#10b981'
        stamp_text = 'ELEVATED RISK' if latest_pred.risk_score >= 50 else 'VERIFIED LOW RISK'
        
        stamp_style = ParagraphStyle(
            'ClinicalStamp',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=12,
            textColor=colors.HexColor(stamp_border),
            alignment=1
        )
        
        stamp_data = [
            [Paragraph(f"<font size=7 color='#64748b'>CAREPULSE DIAGNOSTICS</font><br/><b>{stamp_text}</b><br/><font size=7 color='#64748b'>AI ASSESS APPROVED</font>", stamp_style)]
        ]
        t_stamp = Table(stamp_data, colWidths=[140])
        t_stamp.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(stamp_bg)),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(stamp_border)),
            ('PADDING', (0,0), (-1,-1), 8),
        ]))
        
        # Build the Callout for Risk Score (Left: text info, Right: stamp)
        risk_bg = '#fef2f2' if latest_pred.risk_score >= 50 else '#f0fdf4'
        risk_border = '#f87171' if latest_pred.risk_score >= 50 else '#34d399'
        risk_text_color = '#b91c1c' if latest_pred.risk_score >= 50 else '#15803d'
        
        callout_style = ParagraphStyle(
            'RiskCalloutText',
            parent=body_style,
            textColor=colors.HexColor(risk_text_color),
            fontSize=10,
            leading=14
        )

        import json
        diab_drivers_text = "No positive risk contributors identified."
        if latest_pred.feature_contributions:
            contribs = latest_pred.feature_contributions
            if isinstance(contribs, str):
                contribs = json.loads(contribs)
            pos_contribs = [(k.replace('_', ' ').capitalize(), v) for k, v in contribs.items() if v > 0]
            pos_contribs.sort(key=lambda x: x[1], reverse=True)
            if pos_contribs:
                diab_drivers_text = ", ".join([f"<b>{k}</b> (+{v:.2f})" for k, v in pos_contribs])
        
        risk_text = Paragraph(
            f"<b>ASSESSMENT RESULT: {latest_pred.prediction.upper()}</b><br/>"
            f"Calculated Diabetes Risk Score: <b>{latest_pred.risk_score}%</b><br/>"
            f"ML Model: <i>{latest_pred.model_name}</i><br/>"
            f"Screening Date: {latest_pred.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}<br/>"
            f"<b>Key Risk Drivers (XAI Impact):</b> {diab_drivers_text}",
            callout_style
        )
        
        risk_callout_data = [[risk_text, t_stamp]]
        t_risk = Table(risk_callout_data, colWidths=[380, 160])
        t_risk.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(risk_bg)),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(risk_border)),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'CENTER'),
            ('PADDING', (0,0), (-1,-1), 8),
        ]))
        
        story.append(t_risk)
        story.append(Spacer(1, 10))
        story.append(t3)
        story.append(Spacer(1, 12))

    # Section B.2: Heart Disease Risk Prediction Analysis
    story.append(Paragraph("3. Heart Disease Risk Prediction Analysis", section_heading))
    if not latest_heart_pred:
        story.append(Paragraph("No cardiovascular screening results found for this patient. Please run a heart risk screening first.", body_style))
    else:
        # Extract top contributing factors for heart disease
        import json
        heart_drivers_text = "No positive risk contributors identified."
        if latest_heart_pred.feature_contributions:
            contribs = latest_heart_pred.feature_contributions
            if isinstance(contribs, str):
                contribs = json.loads(contribs)
            
            feature_names_map = {
                "age_years": "Age",
                "gender": "Gender",
                "height": "Height",
                "weight": "Weight",
                "ap_hi": "Systolic BP (ap_hi)",
                "ap_lo": "Diastolic BP (ap_lo)",
                "cholesterol": "Cholesterol Level",
                "gluc": "Glucose Level",
                "smoke": "Smoking Status",
                "alco": "Alcohol Consumption",
                "active": "Physical Inactivity"
            }
            pos_contribs = []
            for k, v in contribs.items():
                if v > 0:
                    name = feature_names_map.get(k, k.replace('_', ' ').capitalize())
                    pos_contribs.append((name, v))
            pos_contribs.sort(key=lambda x: x[1], reverse=True)
            if pos_contribs:
                heart_drivers_text = ", ".join([f"<b>{k}</b> (+{v:.2f})" for k, v in pos_contribs])

        features_heart_data = [
            [Paragraph("<b>Vital Parameter</b>", table_header_style), Paragraph("<b>Value</b>", table_header_style), Paragraph("<b>Clinical Significance</b>", table_header_style)],
            [Paragraph("Age", table_cell_style), Paragraph(f"{latest_heart_pred.age_years:.1f} years", table_cell_style), Paragraph("Assess age-related cardiovascular risk", table_cell_style)],
            [Paragraph("Systolic BP (ap_hi)", table_cell_style), Paragraph(f"{latest_heart_pred.ap_hi} mm Hg", table_cell_style), Paragraph("Systolic pressure (&gt; 130 mm Hg indicates hypertension)", table_cell_style)],
            [Paragraph("Diastolic BP (ap_lo)", table_cell_style), Paragraph(f"{latest_heart_pred.ap_lo} mm Hg", table_cell_style), Paragraph("Diastolic pressure (&gt; 80 mm Hg indicates strain)", table_cell_style)],
            [Paragraph("Calculated BMI", table_cell_style), Paragraph(f"{latest_heart_pred.bmi_calculated:.1f}", table_cell_style), Paragraph("Values &gt;= 25 indicate overweight, increasing cardiac workload", table_cell_style)],
            [Paragraph("Cholesterol tier", table_cell_style), Paragraph(f"Tier {latest_heart_pred.cholesterol}", table_cell_style), Paragraph("Higher tiers (2-3) represent elevated lipid levels", table_cell_style)],
            [Paragraph("Glucose tier", table_cell_style), Paragraph(f"Tier {latest_heart_pred.gluc}", table_cell_style), Paragraph("Higher tiers (2-3) represent prediabetic/diabetic glucose", table_cell_style)],
            [Paragraph("Lifestyle factors", table_cell_style), 
             Paragraph(f"Smoke: {'Yes' if latest_heart_pred.smoke else 'No'}<br/>"
                       f"Alcohol: {'Yes' if latest_heart_pred.alco else 'No'}<br/>"
                       f"Active: {'Yes' if latest_heart_pred.active else 'No'}", table_cell_style),
             Paragraph("Cardiovascular health behaviors (tobacco/alcohol use, lack of exercise)", table_cell_style)]
        ]
        
        t_h_features = Table(features_heart_data, colWidths=[120, 100, 320])
        t_h_features.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0d9488')), # Teal header
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,2), (-1,2), colors.white),
            ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,4), (-1,4), colors.white),
            ('BACKGROUND', (0,5), (-1,5), colors.HexColor('#f8fafc')),
            ('BACKGROUND', (0,6), (-1,6), colors.white),
            ('BACKGROUND', (0,7), (-1,7), colors.HexColor('#f8fafc')),
        ]))
        
        h_stamp_bg = '#fef2f2' if latest_heart_pred.risk_score >= 50 else '#f0fdf4'
        h_stamp_border = '#ef4444' if latest_heart_pred.risk_score >= 50 else '#10b981'
        h_stamp_text = 'ELEVATED HEART RISK' if latest_heart_pred.risk_score >= 50 else 'LOW HEART RISK'
        
        h_stamp_style = ParagraphStyle(
            'HeartClinicalStamp',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.HexColor(h_stamp_border),
            alignment=1
        )
        
        h_stamp_data = [
            [Paragraph(f"<font size=7 color='#64748b'>CAREPULSE CARDIO</font><br/><b>{h_stamp_text}</b><br/><font size=7 color='#64748b'>CI: {latest_heart_pred.confidence_lower}%-{latest_heart_pred.confidence_upper}%</font>", h_stamp_style)]
        ]
        t_h_stamp = Table(h_stamp_data, colWidths=[140])
        t_h_stamp.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(h_stamp_bg)),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(h_stamp_border)),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        
        h_callout_style = ParagraphStyle(
            'HeartRiskCalloutText',
            parent=body_style,
            textColor=colors.HexColor('#b91c1c' if latest_heart_pred.risk_score >= 50 else '#15803d'),
            fontSize=10,
            leading=14
        )
        
        h_risk_text = Paragraph(
            f"<b>ASSESSMENT RESULT: {latest_heart_pred.risk_level.upper()} RISK DETECTED</b><br/>"
            f"Calculated Heart Disease Risk Score: <b>{latest_heart_pred.risk_score}%</b> (95% CI: {latest_heart_pred.confidence_lower}% - {latest_heart_pred.confidence_upper}%)<br/>"
            f"ML Model: <i>Cardiovascular Logistic Regressor</i><br/>"
            f"Screening Date: {latest_heart_pred.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}<br/>"
            f"<b>Key Risk Drivers (XAI Impact):</b> {heart_drivers_text}",
            h_callout_style
        )
        
        h_risk_callout_data = [[h_risk_text, t_h_stamp]]
        t_h_risk = Table(h_risk_callout_data, colWidths=[380, 160])
        t_h_risk.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(h_stamp_bg)),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(h_stamp_border)),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'CENTER'),
            ('PADDING', (0,0), (-1,-1), 8),
        ]))
        
        story.append(t_h_risk)
        story.append(Spacer(1, 10))
        story.append(t_h_features)
        story.append(Spacer(1, 12))
        
        if recommendations is not None:
            if latest_heart_pred.risk_level == "High":
                recommendations.append("Cardiologist consultation strongly recommended due to high cardiovascular risk.")
            elif latest_heart_pred.risk_level == "Medium":
                recommendations.append("Consider consultation with a cardiologist due to borderline elevated cardiovascular risk.")

    # Section C: Referrals
    story.append(Paragraph("4. Recommended Referrals & Actions (Rule Engine)", section_heading))
    if not recommendations:
        recommendations_text = "• No immediate clinical actions or referrals recommended at this time."
    else:
        recommendations_list = []
        for r in recommendations:
            recommendations_list.append(f"• {r}")
        recommendations_text = "<br/>".join(recommendations_list)
    
    rec_callout_data = [[
        Paragraph(
            f"Based on the patient's vitals, the clinical decision rule engine recommends the following follow-up actions:<br/><br/>{recommendations_text}",
            ParagraphStyle('RecCalloutText', parent=body_style, fontSize=10, leading=14)
        )
    ]]
    t_rec = Table(rec_callout_data, colWidths=[540])
    t_rec.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('TOPPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_rec)
            
    # Legal Disclaimer
    story.append(Spacer(1, 15))
    disclaimer_data = [[
        Paragraph(
            "<b>LEGAL DISCLAIMER:</b> This document is generated for learning/portfolio demonstration purposes "
            "using synthetic data only. It is NOT intended for real clinical use, diagnostic decisions, or patient treatment. "
            "The risk scores and referrals are generated automatically and do not substitute a professional medical consultation. "
            "If you have medical questions, please schedule an appointment with your primary care physician.",
            disclaimer_style
        )
    ]]
    t_disc = Table(disclaimer_data, colWidths=[540])
    t_disc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fafafa')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_disc)
    
    # 2. Build the PDF
    doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    
    # 3. Return the PDF file response
    return FileResponse(
        path=pdf_path,
        filename=f"patient_summary_report_{patient_id}.pdf",
        media_type="application/pdf"
    )
